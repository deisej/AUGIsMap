//CONFERENCIA_FINAL_AREAS_CAP1
// CONFERÊNCIA FINAL DAS ÁREAS — CAPÍTULO 1
// Período: 2018–2024. Classe AUGI: 9.
// Consulta os assets existentes; não altera os mapas.

var root =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var carta = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var territorio = ee.Image()
  .paint(carta, 'id')
  .rename('territory');

var areaHa = ee.Image.pixelArea()
  .divide(10000)
  .rename('area');

var produtos = [
  [
    'SENTINEL',
    'depressaoPeriferica_classification_SENTINEL_v2'
  ],
  [
    'EMBEDDINGS_BRUTO',
    'depressaoPeriferica_classification_EMBEDDINGS_v2'
  ],
  [
    'EMBEDDINGS_TEMPORAL',
    'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2'
  ],
  [
    'EMBEDDINGS_FINAL',
    'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
  ]
];

var linhas = [];

produtos.forEach(function(produto) {

  var img = ee.Image(root + produto[1]);

  for (var ano = 2018; ano <= 2024; ano++) {

    var banda = img.select('classification_' + ano);
    var grade = banda.projection().getInfo();

    // Mesma seleção de AUGI; varia a grade de redução.
    var selecao = areaHa.updateMask(banda.eq(9));

    // 1 — Grade nativa e geometria da DPP.
    var nativo = selecao.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: carta.geometry(),
      crs: grade.crs,
      crsTransform: grade.transform,
      maxPixels: 1e13,
      tileScale: 4
    }).get('area', 0);

    // 2 — Escala nominal de 10 m e geometria da DPP.
    var nominal = selecao.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: carta.geometry(),
      scale: 10,
      maxPixels: 1e13,
      tileScale: 4
    }).get('area', 0);

    // 3 — Reprodução do cálculo original por território.
    var agrupado = areaHa
      .addBands(territorio)
      .addBands(banda.selfMask())
      .reduceRegion({
        reducer: ee.Reducer.sum()
          .group(1, 'class')
          .group(1, 'territory'),
        geometry: img.geometry(),
        scale: 10,
        maxPixels: 1e13,
        tileScale: 4
      });

    var grupos = ee.List(
      agrupado.get('groups', ee.List([]))
    );

    // Soma somente a classe 9 em todos os territórios.
    var porTerritorio = grupos.map(function(g) {

      var classes = ee.List(
        ee.Dictionary(g).get('groups')
      );

      return ee.Number(classes.iterate(
        function(c, acumulado) {

          c = ee.Dictionary(c);

          var valor = ee.Number(
            ee.Algorithms.If(
              ee.Number(c.get('class')).eq(9),
              c.get('sum'),
              0
            )
          );

          return ee.Number(acumulado).add(valor);
        },
        0
      ));
    });

    var original = ee.Number(
      ee.Algorithms.If(
        porTerritorio.size().gt(0),
        porTerritorio.reduce(ee.Reducer.sum()),
        0
      )
    );

    linhas.push(ee.Feature(null, {
      produto: produto[0],
      ano: ano,
      asset: root + produto[1],

      area_grade_nativa_DPP_ha: nativo,
      area_escala10_DPP_ha: nominal,
      area_codigo_original_territorios_ha: original,

      diferenca_nativa_menos_original_ha:
        ee.Number(nativo).subtract(original),

      crs: grade.crs,
      transformacao: JSON.stringify(grade.transform),
      unidade: 'ha',
      classe: 9
    }));
  }
});

var tabela = ee.FeatureCollection(linhas);

print('Conferência final de áreas', tabela);

Export.table.toDrive({
  collection: tabela,
  description: 'CONFERENCIA_FINAL_AREAS_CAP1',
  folder: 'AUGI_CAP2',
  fileFormat: 'CSV'
});
