// ============================================================
// CAPÍTULO 2 — ETAPA 1
// Conferência de bandas, projeções e grades dos mapas existentes.
// ============================================================

var raiz =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var produtos = [
  {
    nome: 'SENTINEL',
    asset: raiz + 'depressaoPeriferica_classification_SENTINEL_v2'
  },
  {
    nome: 'EMBEDDINGS_BRUTO',
    asset: raiz + 'depressaoPeriferica_classification_EMBEDDINGS_v2'
  },
  {
    nome: 'EMBEDDINGS_TEMPORAL',
    asset: raiz +
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2'
  },
  {
    nome: 'EMBEDDINGS_FINAL',
    asset: raiz +
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
  }
];

var anos = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

var areaEstudo = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var registros = [];

// ============================================================
// 1. CONFERIR CADA PRODUTO E CADA ANO
// ============================================================

produtos.forEach(function(produto) {

  var imagem = ee.Image(produto.asset);
  var bandas = imagem.bandNames();

  print(produto.nome + ' — bandas disponíveis:', bandas);

  anos.forEach(function(ano) {

    var banda = 'classification_' + ano;
    var existe = bandas.contains(banda);

    // Imagem auxiliar apenas para permitir registrar
    var anual = ee.Image(
      ee.Algorithms.If(
        existe,
        imagem.select([banda]),
        ee.Image.constant(0).rename(banda)
      )
    );

    var projecao = anual.projection();

    registros.push(
      ee.Feature(null, {
        produto: produto.nome,
        asset_id: produto.asset,
        ano: ano,
        banda: banda,
        banda_presente: existe,
        crs: ee.Algorithms.If(
          existe, projecao.crs(), 'BANDA_AUSENTE'
        ),
        escala_nominal_m: ee.Algorithms.If(
          existe, projecao.nominalScale(), -1
        ),
        transformacao_grade: ee.Algorithms.If(
          existe, projecao.transform(), ee.List([])
        )
      })
    );

  });

  // Mostra a projeção de 2024 separadamente.
  print(
    produto.nome + ' — projeção de 2024:',
    imagem.select('classification_2024').projection()
  );

  // Camadas inicialmente desligadas para facilitar a navegação.
  Map.addLayer(
    imagem.select('classification_2024')
      .eq(9)
      .selfMask()
      .clip(areaEstudo),
    {palette: ['d026a3']},
    produto.nome + ' — AUGIs 2024',
    false
  );

  // Máscara original: áreas com dados disponíveis.
  Map.addLayer(
    imagem.select('classification_2024')
      .mask()
      .gt(0)
      .selfMask()
      .clip(areaEstudo),
    {palette: ['46a6a0']},
    produto.nome + ' — cobertura válida 2024',
    false
  );

});

var conferencia = ee.FeatureCollection(registros);

print('CONFERÊNCIA COMPLETA — 28 registros:', conferencia);
print(
  'Bandas ausentes:',
  conferencia.filter(ee.Filter.eq('banda_presente', false))
);

Map.centerObject(areaEstudo, 7);

Map.addLayer(
  areaEstudo.style({
    color: '333333',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Limite da DPP'
);

// ============================================================
// 2. EXPORTAR A CONFERÊNCIA
// ============================================================

Export.table.toDrive({
  collection: conferencia,
  description: 'CAP2_01_CONFERENCIA_MAPAS',
  folder: 'AUGI_CAP2',
  fileNamePrefix: 'CAP2_01_CONFERENCIA_MAPAS',
  fileFormat: 'CSV',
  selectors: [
    'produto',
    'asset_id',
    'ano',
    'banda',
    'banda_presente',
    'crs',
    'escala_nominal_m',
    'transformacao_grade'
  ]
});
