// ============================================================
// RESULTADO 1 — SENTINEL-2 × EMBEDDINGS EM 2024
// Mapas regionais de ocorrência + rasters originais para recorte
// Classe 9 = AUGI
// ============================================================


// 1. ÁREAS DE ESTUDO

var dpp = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var corumbatai = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/BaciaCorumbatai'
);

var regiaoDPP = dpp.geometry();
var regiaoRecorte = corumbatai.geometry();


// 2. PRODUTOS DE CLASSIFICAÇÃO

var pasta = (
  'projects/ee-deisejunqueira/assets/' +
  'AUGI-MAP/classification/'
);

var sentinel2024 = ee.Image(
  pasta + 'depressaoPeriferica_classification_SENTINEL_v2'
)
  .select('classification_2024')
  .clip(regiaoDPP);

var embeddings2024 = ee.Image(
  pasta + 'depressaoPeriferica_classification_EMBEDDINGS_v2'
)
  .select('classification_2024')
  .clip(regiaoDPP);

print('Classificação Sentinel-2 em 2024:', sentinel2024);
print('Classificação embeddings em 2024:', embeddings2024);


// 3. PIXELS ORIGINAIS DA CLASSE 9

var augiSentinel = sentinel2024
  .eq(9)
  .selfMask()
  .rename('AUGI_Sentinel_2024');

var augiEmbeddings = embeddings2024
  .eq(9)
  .selfMask()
  .rename('AUGI_Embeddings_2024');


// 4. CONFERÊNCIA DA ÁREA ORIGINAL — SEM DESTAQUE VISUAL

function imprimirArea(nome, mascaraAUGI) {

  var area = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .updateMask(mascaraAUGI);

  var resultado = area.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: regiaoDPP,
    scale: 10,
    maxPixels: 1e13,
    tileScale: 4
  });

  print(nome + ' — área da classe 9 em 2024 (ha):',
        resultado.get('area_ha'));
}

imprimirArea('Sentinel-2', augiSentinel);
imprimirArea('Embeddings', augiEmbeddings);


// 5. MARCAS REGIONAIS DE OCORRÊNCIA
//
// Cada marca indica presença de pelo menos um pixel da classe 9.
// O raio de 1 km torna as ocorrências visíveis na extensão da DPP.
// NÃO calcular área nem tamanho de manchas a partir destas imagens.

var raioDestaqueMetros = 1000;

var marcasSentinel = sentinel2024
  .eq(9)
  .unmask(0)
  .focal_max({
    radius: raioDestaqueMetros,
    units: 'meters'
  })
  .selfMask()
  .clip(regiaoDPP)
  .rename('ocorrencia_destacada_Sentinel');

var marcasEmbeddings = embeddings2024
  .eq(9)
  .unmask(0)
  .focal_max({
    radius: raioDestaqueMetros,
    units: 'meters'
  })
  .selfMask()
  .clip(regiaoDPP)
  .rename('ocorrencia_destacada_Embeddings');


// 6. CONTORNOS

var limiteDPP = ee.Image()
  .byte()
  .paint({
    featureCollection: dpp,
    color: 1,
    width: 2
  })
  .selfMask();

var limiteRecorte = ee.Image()
  .byte()
  .paint({
    featureCollection: corumbatai,
    color: 1,
    width: 2
  })
  .selfMask();


// 7. PAINÉIS INTERATIVOS SINCRONIZADOS

function criarMapa(titulo, marcas, pixelsOriginais) {

  var mapa = ui.Map();

  // Fundo mais claro que a imagem de satélite.
  mapa.setOptions('ROADMAP');

  mapa.addLayer(
    marcas,
    {
      min: 1,
      max: 1,
      palette: ['D81B60']
    },
    'Marcas de ocorrência — não representam área',
    true,
    1
  );

  mapa.addLayer(
    pixelsOriginais,
    {
      min: 1,
      max: 1,
      palette: ['00A9B7']
    },
    'Pixels originais da classe 9',
    false,
    1
  );

  mapa.addLayer(
    limiteDPP,
    {palette: ['303A36']},
    'Limite da DPP',
    true
  );

  mapa.addLayer(
    limiteRecorte,
    {palette: ['245B96']},
    'Bacia do Corumbataí — recorte',
    true
  );

  mapa.add(
    ui.Label({
      value: titulo,
      style: {
        position: 'top-center',
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#202020',
        backgroundColor: 'white',
        padding: '7px',
        margin: '8px'
      }
    })
  );

  return mapa;
}

var mapaSentinel = criarMapa(
  'A — Sentinel-2 | 2024',
  marcasSentinel,
  augiSentinel
);

var mapaEmbeddings = criarMapa(
  'B — Embeddings | 2024',
  marcasEmbeddings,
  augiEmbeddings
);

ui.Map.Linker([mapaSentinel, mapaEmbeddings]);

var painelComparativo = ui.SplitPanel({
  firstPanel: mapaSentinel,
  secondPanel: mapaEmbeddings,
  orientation: 'horizontal',
  wipe: false
});

ui.root.widgets().reset([painelComparativo]);

mapaSentinel.centerObject(dpp, 8);


// 8. EXPORTAR MARCAS PARA OS MAPAS REGIONAIS NO QGIS
//
// Escala de 100 m: suficiente para a composição regional.
// Estes arquivos são de PRESENÇA DESTACADA, não de área real.

Export.image.toDrive({
  image: marcasSentinel.unmask(0).toByte(),
  description: 'R1_mapa_regional_Sentinel_2024',
  fileNamePrefix: 'R1_mapa_regional_Sentinel_2024',
  folder: 'FIGURAS-TESE-AUGI',
  region: regiaoDPP,
  scale: 100,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

Export.image.toDrive({
  image: marcasEmbeddings.unmask(0).toByte(),
  description: 'R1_mapa_regional_Embeddings_2024',
  fileNamePrefix: 'R1_mapa_regional_Embeddings_2024',
  folder: 'FIGURAS-TESE-AUGI',
  region: regiaoDPP,
  scale: 100,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


// 9. EXPORTAR PIXELS ORIGINAIS PARA OS RECORTES NO QGIS
//
// Escala de 10 m: mantém o produto original.
// Exporta a Bacia do Corumbataí como área inicial de trabalho.
// No QGIS, escolheremos o MESMO recorte menor nos dois rasters.

Export.image.toDrive({
  image: augiSentinel
    .unmask(0)
    .clip(regiaoRecorte)
    .toByte(),

  description: 'R1_pixels_originais_Sentinel_2024_Corumbatai',
  fileNamePrefix: 'R1_pixels_originais_Sentinel_2024_Corumbatai',
  folder: 'FIGURAS-TESE-AUGI',
  region: regiaoRecorte,
  scale: 10,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

Export.image.toDrive({
  image: augiEmbeddings
    .unmask(0)
    .clip(regiaoRecorte)
    .toByte(),

  description: 'R1_pixels_originais_Embeddings_2024_Corumbatai',
  fileNamePrefix: 'R1_pixels_originais_Embeddings_2024_Corumbatai',
  folder: 'FIGURAS-TESE-AUGI',
  region: regiaoRecorte,
  scale: 10,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});
