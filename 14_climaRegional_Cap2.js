/ ============================================================
// CAPÍTULO 2 — CLIMA REGIONAL DA DPP
// Referência climática: 1991–2020
// Período dos mapas: 2017–2024
//
// Exportações:
// 1. Dados mensais 1991–2024 com anomalias
// 2. Dados anuais 1991–2024 com anomalias
// 3. Referência mensal 1991–2020
//
// Não altera os mapas nem utiliza dist_river.
// ============================================================

// 1. ÁREA DE ESTUDO
var carta = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);
var regiao = carta.geometry();

Map.centerObject(carta, 7);
Map.addLayer(carta, {color: 'black'}, 'Limite DPP');

// 2. COLEÇÃO CLIMÁTICA
var fonte = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
  .filterDate('1991-01-01', '2025-01-01')
  .select([
    'total_precipitation_sum',
    'temperature_2m',
    'total_evaporation_sum'
  ])
  .sort('system:time_start');

// Objeto completo de projeção.
// Não usar projecao.transform() como crsTransform.
var projecao = ee.Image(fonte.first())
  .select('temperature_2m')
  .projection();

print('Meses disponíveis — esperado: 408', fonte.size());
print('Projeção original', projecao);

// 3. CONVERSÃO DAS UNIDADES
var bandas = ['P_mm', 'T_C', 'ET_mm', 'PmenosET_mm'];

var mensal = fonte.map(function(img) {
  var data = ee.Date(img.get('system:time_start'));
  var dias = data.advance(1, 'month').difference(data, 'day');

  var p = img.select('total_precipitation_sum')
    .multiply(1000)
    .rename('P_mm');

  var t = img.select('temperature_2m')
    .subtract(273.15)
    .rename('T_C');

  // Saída líquida de água representada com sinal positivo.
  // Não é evapotranspiração potencial.
  // Não usar abs(), pois isso esconderia valores negativos.
  var et = img.select('total_evaporation_sum')
    .multiply(-1000)
    .rename('ET_mm');

  // Indicador simplificado; não é balanço hídrico completo.
  var pe = p.subtract(et).rename('PmenosET_mm');

  return ee.Image.cat([p, t, et, pe]).set({
    'system:time_start': data.millis(),
    ano: data.get('year'),
    mes: data.get('month'),
    dias: dias,
    data: data.format('YYYY-MM')
  });
});

// 4. MÉDIA REGIONAL PONDERADA PELA ÁREA
function mediaRegional(img) {
  img = ee.Image(img).select(bandas);

  var mascara = img.mask().reduce(ee.Reducer.min());

  var pesos = ee.Image.pixelArea()
    .updateMask(mascara)
    .rename('peso_m2');

  var somas = img.multiply(pesos)
    .addBands(pesos)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: regiao,
      crs: projecao,
      maxPixels: 1e8,
      tileScale: 4
    });

  var peso = ee.Number(somas.get('peso_m2'));

  var valores = bandas.map(function(b) {
    return ee.Number(somas.get(b)).divide(peso);
  });

  return ee.Dictionary.fromLists(bandas, valores)
    .set('area_clima_valida_km2', peso.divide(1e6));
}

// 5. TABELA MENSAL
var tabelaMensal = ee.FeatureCollection(
  mensal.toList(mensal.size()).map(function(item) {
    var img = ee.Image(item);

    return ee.Feature(null, mediaRegional(img)).set({
      ano: img.get('ano'),
      mes: img.get('mes'),
      dias: img.get('dias'),
      data: img.get('data'),
      referencia: '1991-2020',
      fonte: 'ERA5_LAND_MONTHLY_AGGR'
    });
  })
).sort('data');

// 6. EXPORTAÇÃO DOS DADOS MENSAIS
// Referências, anomalias e agregações anuais serão
// calculadas posteriormente a partir deste CSV.

// Consulta pequena para verificar a extração.
print('Teste — janeiro de 2017',
  tabelaMensal.filter(ee.Filter.eq('data', '2017-01'))
);

// Exportação completa: esperado 408 registros.
Export.table.toDrive({
  collection: tabelaMensal,
  description: 'CAP2_CLIMA_MENSAL_DPP_1991_2024_v3',
  folder: 'CAP2_DIAGNOSTICO_AMBIENTAL',
  fileNamePrefix: 'CAP2_CLIMA_MENSAL_DPP_1991_2024_v3',
  fileFormat: 'CSV',
  selectors: [
    'data',
    'ano',
    'mes',
    'dias',
    'P_mm',
    'T_C',
    'ET_mm',
    'PmenosET_mm',
    'area_clima_valida_km2',
    'referencia',
    'fonte'
  ]
});
