// ============================================================
// DIAGNÓSTICO DO PREDITOR dist_river — CAPÍTULO 1
// Não altera treinamento, classificações ou assets.
// ============================================================

// 1. Caminhos
var base = 'projects/ee-deisejunqueira/assets/';

var dpp = ee.FeatureCollection(
  base + 'DepressaoPeriferica'
);

var rios = ee.FeatureCollection(
  base + 'Ughri05_hidrografia'
).filterBounds(dpp);

// 2. Parâmetros do diagnóstico
var raioBusca = 100000; // 100 km, em metros

var proj = ee.Projection('EPSG:31983')
  .atScale(10);

// 3. Conferência do raster utilizado no código original
var rasterOriginal = ee.Image(0)
  .byte()
  .paint(rios, 1)
  .clip(dpp);

print(
  '1 — Projeção declarada do raster original',
  rasterOriginal.projection()
);

print(
  '2 — Escala nominal declarada do raster original',
  rasterOriginal.projection().nominalScale()
);

print(
  '3 — Quantidade de feições hidrográficas no domínio',
  rios.size()
);

// A projeção declarada, isoladamente, não demonstra
// a grade efetiva utilizada nas execuções anteriores.

// 4. Distância em metros ao mesmo vetor hidrográfico
var distanciaMetros = rios.distance({
  searchRadius: raioBusca,
  maxError: 1
}).rename('dist_vetor_m');

// Preservar pontos sem geometria hidrográfica até 100 km.
// -9999 é um código de ausência, não uma distância.
var consulta = distanciaMetros
  .unmask(-9999)
  .addBands(
    distanciaMetros.mask()
      .unmask(0)
      .rename('rio_no_raio')
  );

// 5. Ler os assets de treinamento de 2018
var modelos = ['SENTINEL', 'EMBEDDINGS'];

var pontos = ee.FeatureCollection([]);

modelos.forEach(function(modelo) {

  var caminho = base +
    'AUGI-MAP/training/v2/' +
    'depressaoPeriferica_2018_training_' +
    modelo + '_v2';

  var fc = ee.FeatureCollection(caminho);

  print(
    'Treinamento 2018 — ' + modelo + ': total',
    fc.size()
  );

  print(
    'Treinamento 2018 — ' + modelo +
    ': registros com valor extremo',
    fc.filter(
      ee.Filter.gte('dist_river', 1390228.49)
    ).size()
  );

  // Seleção reprodutível de até 500 registros por modelo.
  fc = fc
    .filter(ee.Filter.notNull(['dist_river']))
    .randomColumn('aud_rand', 42)
    .sort('aud_rand')
    .limit(500)
    .map(function(f) {

      var xy = f.geometry()
        .transform('EPSG:4326', 1)
        .coordinates();

      return ee.Feature(f.geometry(), {
        modelo: modelo,
        id_origem: f.id(),
        reference: f.get('reference'),
        dist_armazenada: f.get('dist_river'),
        latitude: xy.get(1),
        longitude: xy.get(0)
      });
    });

  pontos = pontos.merge(fc);
});

// 6. Comparar a distância armazenada com a distância métrica
var comparacao = consulta.sampleRegions({
  collection: pontos,
  projection: proj,
  scale: 10,
  geometries: false,
  tileScale: 4
});

print(
  'Prévia da comparação',
  comparacao.limit(10)
);

// 7. Visualizar o limite e a hidrografia utilizada
Map.centerObject(dpp, 7);

Map.addLayer(
  dpp,
  {color: 'gray'},
  'Limite DPP'
);

Map.addLayer(
  rios,
  {color: 'blue'},
  'Hidrografia efetivamente utilizada'
);

// 8. Exportar a tabela de diagnóstico
Export.table.toDrive({
  collection: comparacao,
  description: 'DIAGNOSTICO_DIST_RIVER_CAP1',
  fileNamePrefix: 'DIAGNOSTICO_DIST_RIVER_CAP1',
  fileFormat: 'CSV',
  selectors: [
    'modelo',
    'id_origem',
    'reference',
    'latitude',
    'longitude',
    'dist_armazenada',
    'dist_vetor_m',
    'rio_no_raio'
  ]
});

// INTERPRETAÇÃO DOS CAMPOS:
//
// dist_armazenada:
// Valor efetivamente registrado no treinamento original.
//
// dist_vetor_m:
// Distância em metros ao mesmo vetor hidrográfico.
//
// rio_no_raio:
// 1 = existe geometria desse vetor até 100 km.
// 0 = não existe geometria desse vetor até 100 km.
//
// dist_vetor_m = -9999:
// Ausência de geometria desse vetor no raio de busca.
// Não significa ausência de rios reais.
//
// Não substituir dist_river nos classificadores
// antes de avaliar os resultados deste diagnóstico.
