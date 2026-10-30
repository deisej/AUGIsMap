//VALIDACAO_01_CONFERIR_MAPAS_2024
// ============================================================
// VALIDACAO AUGI — 2024
// ETAPA 1: CONFERIR MAPAS E GRUPOS PRELIMINARES
//
// Este codigo:
// 1. Carrega os quatro mapas existentes.
// 2. Seleciona o ano de 2024.
// 3. Identifica AUGI pela classe 9.
// 4. Usa uma grade comum de 10 metros.
// 5. Preserva ausencia de dados.
// 6. Organiza grupos preliminares.
// 7. Exporta suas areas em hectares.
//
// Nao altera os assets e nao sorteia pontos.
// ============================================================


// ------------------------------------------------------------
// 1. CONFIGURACOES
// ------------------------------------------------------------

var root =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var dpp = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

// SIRGAS 2000 / UTM 23S.
// Pixels de 10 metros, com alinhamento fixo.
var grade = ee.Projection(
  'EPSG:31983',
  [10, 0, 0, 0, -10, 0]
);


// ------------------------------------------------------------
// 2. LISTA DOS PRODUTOS
// ------------------------------------------------------------

var produtos = [
  {
    nome: 'Sentinel bruto',
    arquivo: 'depressaoPeriferica_classification_SENTINEL_v2',
    banda: 'sentinel'
  },
  {
    nome: 'Embeddings bruto',
    arquivo: 'depressaoPeriferica_classification_EMBEDDINGS_v2',
    banda: 'emb_bruto'
  },
  {
    nome: 'Embeddings temporal',
    arquivo:
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2',
    banda: 'emb_temporal'
  },
  {
    nome: 'Embeddings final',
    arquivo:
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2',
    banda: 'emb_final'
  }
];


// ------------------------------------------------------------
// 3. CARREGAR MAPAS E IDENTIFICAR AUGI
// ------------------------------------------------------------

var binarios = ee.Image([]);

produtos.forEach(function(p) {

  var original = ee.Image(root + p.arquivo);

  print('Bandas - ' + p.nome, original.bandNames());

  var anual = original.select('classification_2024');

  print(
    'Projecao original - ' + p.nome,
    anual.projection()
  );

  // 1 = AUGI; 0 = demais classes.
  // Pixels sem dados continuam mascarados.
  var binario = anual
    .eq(9)
    .rename(p.banda)
    .toByte()
    .reproject(grade)
    .clipToCollection(dpp);

  binarios = binarios.addBands(binario);

  // selfMask e usado apenas na visualizacao,
  // para mostrar somente os pixels AUGI.
  Map.addLayer(
    binario.selfMask(),
    {
      min: 1,
      max: 1,
      palette: ['008fa1']
    },
    p.nome + ' - AUGI',
    false
  );

});


// ------------------------------------------------------------
// 4. IDENTIFICAR COBERTURA VALIDA COMUM
// ------------------------------------------------------------

// Um pixel precisa ter dados nos quatro produtos.
var coberturaComum = binarios
  .mask()
  .reduce(ee.Reducer.min())
  .gt(0)
  .rename('cobertura_comum')
  .clipToCollection(dpp);

// Restringir a comparacao a essa cobertura.
var mapas = binarios.updateMask(coberturaComum);


// ------------------------------------------------------------
// 5. CONSTRUIR GRUPOS PRELIMINARES
// ------------------------------------------------------------

// 1 quando pelo menos um dos quatro mapas indica AUGI.
var qualquer = mapas.reduce(ee.Reducer.max());

// Classificacao binaria do mapa final.
var final = mapas.select('emb_final');

// Grupo 0: nenhum mapa indica AUGI.
// Grupo 1: o mapa final indica AUGI.
// Grupo 2: algum outro mapa indica AUGI, mas o final nao.

var grupos = mapas
  .select('sentinel')
  .multiply(0)
  .where(
    qualquer.eq(1).and(final.eq(0)),
    2
  )
  .where(
    final.eq(1),
    1
  )
  .rename('grupo')
  .toByte();

print(
  'Grupos PRELIMINARES:',
  '0 = nenhum mapa; ' +
  '1 = AUGI no mapa final; ' +
  '2 = AUGI em outros mapas, fora da AUGI final'
);


// ------------------------------------------------------------
// 6. VISUALIZAR GRUPOS E LIMITE
// ------------------------------------------------------------

Map.addLayer(
  grupos,
  {
    min: 0,
    max: 2,
    palette: [
      'eeeeee',  // Grupo 0: cinza claro.
      '008fa1',  // Grupo 1: ciano.
      'd98d35'   // Grupo 2: laranja.
    ]
  },
  'Grupos preliminares',
  false
);

Map.addLayer(
  coberturaComum.selfMask(),
  {
    palette: ['dddddd']
  },
  'Cobertura valida comum',
  false
);

Map.addLayer(
  dpp.style({
    color: '333333',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Limite DPP',
  true
);

Map.centerObject(dpp, 8);


// ------------------------------------------------------------
// 7. CALCULAR AREA DOS GRUPOS
// ------------------------------------------------------------

// pixelArea retorna metros quadrados.
// Dividir por 10.000 converte para hectares.
var area = ee.Image
  .pixelArea()
  .divide(10000)
  .rename('area_ha');

var soma = area
  .addBands(grupos)
  .reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'grupo'
    }),
    geometry: dpp.geometry(),
    crs: grade,
    maxPixels: 1e13,
    tileScale: 4
  });


// ------------------------------------------------------------
// 8. TRANSFORMAR RESULTADO EM TABELA
// ------------------------------------------------------------

var lista = ee.List(
  ee.Dictionary(soma).get('groups', ee.List([]))
);

var tabela = ee.FeatureCollection(
  lista.map(function(item) {

    item = ee.Dictionary(item);

    return ee.Feature(null, {
      ano: 2024,
      grupo: item.get('grupo'),
      area_ha: item.get('sum')
    });

  })
);


// ------------------------------------------------------------
// 9. EXPORTAR CSV PARA O GOOGLE DRIVE
// ------------------------------------------------------------

Export.table.toDrive({
  collection: tabela,
  description: 'VALIDACAO_01_GRUPOS_PRELIMINARES_2024',
  folder: 'VALIDACAO_AUGI_2024',
  fileNamePrefix: 'VALIDACAO_01_GRUPOS_PRELIMINARES_2024',
  fileFormat: 'CSV',
  selectors: [
    'ano',
    'grupo',
    'area_ha'
  ]
});

print(
  'Uma tarefa CSV foi criada na aba Tasks. ' +
  'Ainda nao ha sorteio de pontos.'
);
