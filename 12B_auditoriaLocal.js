// --- --- --- AUDITORIA LOCAL — AUD_10 E AUD_22 --- --- --- 
// Compara temporal e final

var root =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var temporal = ee.Image(
  root +
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2'
);

var final = ee.Image(
  root +
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
);

var pontos = ee.FeatureCollection([
  ee.Feature(
    ee.Geometry.Point([-47.026670, -21.889293]),
    {id: 'AUD_10'}
  ),
  ee.Feature(
    ee.Geometry.Point([-47.027479, -21.889653]),
    {id: 'AUD_22'}
  )
]);

// Janela fixa para os dois anos.
var janela = pontos.geometry().buffer(300).bounds();

var proj = temporal.select('classification_2024').projection();
var grade = proj.getInfo();
var pixelHa = ee.Image.pixelArea().divide(10000);

// Cobertura válida comum aos dois produtos e dois anos.
var suporte = temporal.select('classification_2023')
  .mask().gt(0).unmask(0, false);

[temporal, final].forEach(function(img) {
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

function medir(indicador) {
  var soma = indicador.rename('area')
    .multiply(pixelHa)
    .updateMask(suporte)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: janela,
      crs: grade.crs,
      crsTransform: grade.transform,
      maxPixels: 1e8,
      tileScale: 4
    });

  return ee.Number(soma.get('area', 0));
}

Map.setOptions('SATELLITE');
Map.centerObject(janela, 17);

var linhas = [];

[2023, 2024].forEach(function(ano) {
  var t = augi(temporal, ano);
  var f = augi(final, ano);

  var mantida = t.and(f);
  var removida = t.and(f.not());
  var adicionada = t.not().and(f);

  // 1 = mantida; 2 = removida; 3 = adicionada.
  var alteracao = t.multiply(0).toByte()
    .where(mantida, 1)
    .where(removida, 2)
    .where(adicionada, 3)
    .rename('alteracao')
    .updateMask(suporte)
    .selfMask()
    .clip(janela);

  Map.addLayer(
    alteracao,
    {
      min: 1,
      max: 3,
      palette: ['00ffff', 'ff3300', 'ffff00']
    },
    'Alterações do espacial — ' + ano,
    ano === 2024,
    0.7
  );

  var areaT = medir(t);
  var areaF = medir(f);
  var areaMantida = medir(mantida);
  var areaRemovida = medir(removida);
  var areaAdicionada = medir(adicionada);

  linhas.push(ee.Feature(null, {
    ano: ano,
    temporal_ha: areaT,
    final_ha: areaF,
    mantida_ha: areaMantida,
    removida_ha: areaRemovida,
    adicionada_ha: areaAdicionada,
    saldo_ha: areaF.subtract(areaT),
    erro_balanco_ha: areaF.subtract(areaT)
      .subtract(areaAdicionada.subtract(areaRemovida)),
    suporte: 'janela_local_comum_2023_2024',
    observacao: 'Totais da janela; nao de uma unica mancha'
  }));

  // GeoTIFF para eventual comparação no QGIS.
  // Zero = nenhuma das alterações; consultar suporte_valid.
  var raster = ee.Image.cat([
    t.rename('temporal_AUGI'),
    f.rename('final_AUGI'),
    alteracao.unmask(0, false).rename('alteracao'),
    suporte.rename('suporte_valid')
  ]).toByte().clip(janela);

  Export.image.toDrive({
    image: raster,
    description: 'AUDITORIA_04_RECORTE_' + ano,
    folder: 'AUGI_CAP2',
    region: janela,
    crs: grade.crs,
    crsTransform: grade.transform,
    maxPixels: 1e8,
    fileFormat: 'GeoTIFF'
  });
});

var tabela = ee.FeatureCollection(linhas);

Map.addLayer(
  pontos.style({
    color: 'ffffff',
    pointSize: 6,
    width: 2
  }),
  {},
  'AUD_10 e AUD_22'
);

print('Áreas na janela local', tabela);
print('Pontos — clique no mapa com o Inspector', pontos);

Export.table.toDrive({
  collection: tabela,
  description: 'AUDITORIA_04_AREAS_JANELA_LOCAL',
  folder: 'AUGI_CAP2',
  fileFormat: 'CSV'
});
