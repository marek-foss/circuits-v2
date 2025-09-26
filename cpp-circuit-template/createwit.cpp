#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <sys/stat.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <unistd.h>
#include <nlohmann/json.hpp>
#include <vector>

#include <alt_bn128.hpp>

#include "<TARGET_NAME>_circom.hpp"
#include "<TARGET_NAME>_calcwit.hpp"
namespace <TARGET_NAME> {
using json = nlohmann::json;

Circom_Circuit *loadCircuit(void *datFile, uint64_t datSize)
{
  Circom_Circuit *circuit = new Circom_Circuit;
  u8 *bdata = (u8 *)datFile;

  circuit->InputHashMap = new HashSignalInfo[get_size_of_input_hashmap()];
  uint dsize = get_size_of_input_hashmap() * sizeof(HashSignalInfo);
  memcpy((void *)(circuit->InputHashMap), (void *)bdata, dsize);

  circuit->witness2SignalList = new u64[get_size_of_witness()];
  uint inisize = dsize;
  dsize = get_size_of_witness() * sizeof(u64);
  memcpy((void *)(circuit->witness2SignalList), (void *)(bdata + inisize), dsize);

  circuit->circuitConstants = new FrElement[get_size_of_constants()];
  if (get_size_of_constants() > 0)
  {
    inisize += dsize;
    dsize = get_size_of_constants() * sizeof(FrElement);
    memcpy((void *)(circuit->circuitConstants), (void *)(bdata + inisize), dsize);
  }

  std::map<u32, IODefPair> templateInsId2IOSignalInfo1;
  if (get_size_of_io_map() > 0)
  {
    u32 index[get_size_of_io_map()];
    inisize += dsize;
    dsize = get_size_of_io_map() * sizeof(u32);
    memcpy((void *)index, (void *)(bdata + inisize), dsize);
    inisize += dsize;
    assert(inisize % sizeof(u32) == 0);
    assert(datSize % sizeof(u32) == 0);
    u32 dataiomap[(datSize - inisize) / sizeof(u32)];
    memcpy((void *)dataiomap, (void *)(bdata + inisize), datSize - inisize);
    u32 *pu32 = dataiomap;

    for (int i = 0; i < get_size_of_io_map(); i++)
    {
      u32 n = *pu32;
      IODefPair p;
      p.len = n;
      IODef defs[n];
      pu32 += 1;
      for (u32 j = 0; j < n; j++)
      {
        defs[j].offset = *pu32;
        u32 len = *(pu32 + 1);
        defs[j].len = len;
        defs[j].lengths = new u32[len];
        memcpy((void *)defs[j].lengths, (void *)(pu32 + 2), len * sizeof(u32));
        pu32 += len + 2;
      }
      p.defs = (IODef *)calloc(10, sizeof(IODef));
      for (u32 j = 0; j < p.len; j++)
      {
        p.defs[j] = defs[j];
      }
      templateInsId2IOSignalInfo1[index[i]] = p;
    }
  }
  circuit->templateInsId2IOSignalInfo = move(templateInsId2IOSignalInfo1);

  return circuit;
}

void json2FrElements(json val, std::vector<FrElement> &vval)
{
  if (!val.is_array())
  {
    FrElement v;
    std::string s;
    if (val.is_string())
    {
      s = val.get<std::string>();
    }
    else if (val.is_number())
    {
      double vd = val.get<double>();
      std::stringstream stream;
      stream << std::fixed << std::setprecision(0) << vd;
      s = stream.str();
    }
    else
    {
      throw new std::runtime_error("Invalid JSON type");
    }
    Fr_str2element(&v, s.c_str());
    vval.push_back(v);
  }
  else
  {
    for (uint i = 0; i < val.size(); i++)
    {
      json2FrElements(val[i], vval);
    }
  }
}

void loadJson(Circom_CalcWit *ctx, std::string input)
{
  json j = json::parse(input);
  u64 nItems = j.size();
  // printf("Items : %llu\n",nItems);
  for (json::iterator it = j.begin(); it != j.end(); ++it)
  {
    // std::cout << it.key() << " => " << it.value() << '\n';
    u64 h = fnv1a(it.key());
    std::vector<FrElement> v;
    json2FrElements(it.value(), v);
    uint signalSize = ctx->getInputSignalSize(h);
    if (v.size() < signalSize)
    {
      std::ostringstream errStrStream;
      errStrStream << "Error loading signal " << it.key() << ": Not enough values\n";
      throw std::runtime_error(errStrStream.str());
    }
    if (v.size() > signalSize)
    {
      std::ostringstream errStrStream;
      errStrStream << "Error loading signal " << it.key() << ": Too many values\n";
      throw std::runtime_error(errStrStream.str());
    }
    for (uint i = 0; i < v.size(); i++)
    {
      try
      {
        // std::cout << it.key() << "," << i << " => " << Fr_element2str(&(v[i])) << '\n';
        ctx->setInputSignal(h, i, v[i]);
      }
      catch (std::runtime_error e)
      {
        std::ostringstream errStrStream;
        errStrStream << "Error setting signal: " << it.key() << "\n"
                     << e.what();
        throw std::runtime_error(errStrStream.str());
      }
    }
  }
}

AltBn128::FrElement *createWitness(uint64_t &size, void *datFile, uint64_t datSize, std::string input)
{
  Circom_Circuit *circuit = loadCircuit(datFile, datSize);
  Circom_CalcWit *ctx = new Circom_CalcWit(circuit);
  loadJson(ctx, input);

  if (ctx->getRemaingInputsToBeSet() != 0)
  {
    std::cerr << "Not all inputs have been set. Only " << get_main_input_signal_no() - ctx->getRemaingInputsToBeSet() << " out of " << get_main_input_signal_no() << std::endl;
    assert(false);
  }

  FrElement v;
  uint Nwtns = get_size_of_witness();
  AltBn128::FrElement *wtnsData = new AltBn128::FrElement[Nwtns];

  for (int i = 0; i < Nwtns; i++)
  {
    ctx->getWitness(i, &v);
    Fr_toLongNormal(&v, &v);
    RawFr::field.copy(wtnsData[i], *((RawFr::Element *)v.longVal));
  }

  delete ctx;
  delete circuit;

  return wtnsData;
}
}
