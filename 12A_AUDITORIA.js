// --- --- --- 12_AUDITORIA DOS GANHOS DE AUGI — 2023 → 2024 --- --- --- 
// Classe AUGI = 9. Não altera os assets.

var root = 'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var bruto = ee.Image(
  root + 'depressaoPeriferica_classification_EMBEDDINGS_v2'
);
var temporal = ee.Image(
  root + 'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2'
);
var final = ee.Image(
  root + 'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
);

var dpp = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);
var regiao = dpp.geometry();
var proj = bruto.select('classification_2024').projection();
var grade = proj.getInfo();
var areaHa = ee.Image.pixelArea().divide(10000);

// Mesma cobertura válida para os três produtos e os dois anos.
var suporte = ee.Image.constant(1);
[bruto, temporal, final].forEach(function(img) {
  [2023, 2024].forEach(function(ano) {
    suporte = suporte.and(
      img.select('classification_' + ano)
        .mask().gt(0).unmask(0, false)
    );
  });
});

function augi(img, ano) {
  return img.select('classification_' + ano)
    .eq(9).unmask(0, false);
}

function area(indicador) {
  var resultado = indicador.rename('area')
    .multiply(areaHa)
    .updateMask(suporte)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: regiao,
      crs: grade.crs,
      crsTransform: grade.transform,
      maxPixels: 1e13,
      tileScale: 4
    });
  return ee.Number(resultado.get('area', 0));
}

// TABELA 1 — ganhos, perdas e persistência em cada etapa.
var etapas = [
  {nome: 'BRUTO', img: bruto},
  {nome: 'TEMPORAL', img: temporal},
  {nome: 'FINAL', img: final}
];

var resumo = ee.FeatureCollection(etapas.map(function(etapa) {
  var a = augi(etapa.img, 2023);
  var b = augi(etapa.img, 2024);

  return ee.Feature(null, {
    produto: etapa.nome,
    area_2023_ha: area(a),
    area_2024_ha: area(b),
    ganho_ha: area(a.not().and(b)),
    perda_ha: area(a.and(b.not())),
    persistencia_ha: area(a.and(b)),
    suporte: 'comum_tres_produtos_2023_2024'
  });
}));

// TABELA 2 — destino dos ganhos identificados no mapa bruto.
// 1 = AUGI; 0 = outra classe.
var ganhosBrutos = augi(bruto, 2023).not()
  .and(augi(bruto, 2024));

var t23 = augi(temporal, 2023);
var t24 = augi(temporal, 2024);
var f23 = augi(final, 2023);
var f24 = augi(final, 2024);

var linhas = [];

for (var codigo = 0; codigo < 16; codigo++) {
  var a = codigo & 1;
  var b = (codigo >> 1) & 1;
  var c = (codigo >> 2) & 1;
  var d = (codigo >> 3) & 1;

  var destino = ganhosBrutos
    .and(t23.eq(a))
    .and(t24.eq(b))
    .and(f23.eq(c))
    .and(f24.eq(d));

  linhas.push(ee.Feature(null, {
    temporal_2023_AUGI: a,
    temporal_2024_AUGI: b,
    final_2023_AUGI: c,
    final_2024_AUGI: d,
    area_ha: area(destino)
  }));
}

var destinos = ee.FeatureCollection(linhas);

print('Resumo por etapa', resumo);
print('Destino dos ganhos brutos', destinos);

Map.centerObject(dpp, 8);
Map.addLayer(
  ganhosBrutos.updateMask(suporte).selfMask(),
  {palette: ['ff00ff']},
  'Ganhos brutos 2023–2024'
);
Map.addLayer(
  ganhosBrutos.and(t24.not())
    .updateMask(suporte).selfMask(),
  {palette: ['ff9900']},
  'Ganhos brutos ausentes no temporal 2024',
  false
);
Map.addLayer(
  ganhosBrutos.and(t23).and(t24)
    .updateMask(suporte).selfMask(),
  {palette: ['00ffff']},
  'Ganhos brutos presentes nos dois anos após filtro',
  false
);

Export.table.toDrive({
  collection: resumo,
  description: 'AUDITORIA_01_RESUMO_2023_2024',
  folder: 'AUGI_CAP2',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: destinos,
  description: 'AUDITORIA_02_DESTINO_GANHOS_BRUTOS',
  folder: 'AUGI_CAP2',
  fileFormat: 'CSV'
});

// COMPLEMENTO — PONTOS PARA INSPEÇÃO DOS FILTROS
// Amostra exploratória de pixels

// Grupos exclusivos entre si:
// 1: ganho bruto removido pelo temporal em 2024;
// 2: ganho bruto virou persistência e permaneceu no final;
// 3: ganho bruto permaneceu no temporal, mas saiu no espacial.

var grupo1 = ganhosBrutos.and(t24.not());

var grupo2 = ganhosBrutos
  .and(t23).and(t24)
  .and(f23).and(f24);

var grupo3 = ganhosBrutos
  .and(t24).and(f24.not());

var grupos = ganhosBrutos.multiply(0).toByte()
  .where(grupo1, 1)
  .where(grupo2, 2)
  .where(grupo3, 3)
  .rename('grupo')
  .updateMask(suporte)
  .selfMask();

// Classes originais, sem reduzir a AUGI / não AUGI.
var atributos = grupos;

[
  {nome: 'bruto', img: bruto},
  {nome: 'temporal', img: temporal},
  {nome: 'final', img: final}
].forEach(function(etapa) {
  [2022, 2023, 2024].forEach(function(ano) {
    atributos = atributos.addBands(
      etapa.img.select('classification_' + ano)
        .unmask(-9999, false)
        .rename(etapa.nome + '_' + ano)
    );
  });
});

var pontos = atributos.stratifiedSample({
  numPoints: 10,
  classBand: 'grupo',
  region: regiao,
  projection: proj,
  seed: 42,
  geometries: true,
  dropNulls: false,
  tileScale: 4
});

pontos = pontos.map(function(ponto) {
  var xy = ponto.geometry()
    .transform('EPSG:4326', 1)
    .coordinates();

  var descricao = ee.Dictionary({
    '1': 'Removido pelo temporal em 2024',
    '2': 'Transformado em persistencia e mantido no final',
    '3': 'Removido pelo espacial em 2024'
  }).get(ee.Number(ponto.get('grupo')).format('%d'));

  return ponto.set({
    id_inspecao: ee.String('AUD_').cat(ponto.id()),
    longitude: xy.get(0),
    latitude: xy.get(1),
    situacao: descricao
  });
});

print('Pontos para inspeção', pontos);

Map.addLayer(
  pontos.filter(ee.Filter.eq('grupo', 1)),
  {color: 'ff9900'},
  'Pontos 1 — removidos pelo temporal'
);

Map.addLayer(
  pontos.filter(ee.Filter.eq('grupo', 2)),
  {color: '00ffff'},
  'Pontos 2 — transformados em persistência'
);

Map.addLayer(
  pontos.filter(ee.Filter.eq('grupo', 3)),
  {color: 'ff0000'},
  'Pontos 3 — removidos pelo espacial'
);

Export.table.toDrive({
  collection: pontos,
  description: 'AUDITORIA_03_PONTOS_INSPECAO',
  folder: 'AUGI_CAP2',
  fileFormat: 'CSV',
  selectors: [
    'id_inspecao', 'grupo', 'situacao',
    'longitude', 'latitude',
    'bruto_2022', 'bruto_2023', 'bruto_2024',
    'temporal_2022', 'temporal_2023', 'temporal_2024',
    'final_2022', 'final_2023', 'final_2024',
    '.geo'
  ]
});
