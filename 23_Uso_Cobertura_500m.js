// ============================================================
// CAPÍTULO 2 — USO E COBERTURA NO ENTORNO FIXO DE 500 m
//
// Referência: união das detecções finais de AUGIs 2018–2024.
// Exclui o interior dessa união.
// Sobreposições entre entornos são contadas uma única vez.
// Uso e cobertura: MapBiomas Coleção 10.1.
// Saída: área por classe e ano, em hectares.
//
// Não modifica os mapas de AUGIs nem utiliza dist_river.
// O entorno herda as limitações do inventário final,
// incluindo os efeitos dos filtros em 2023–2024.
// ============================================================

// 1. CONFIGURAÇÕES
var anos = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

var distanciaBuffer = 500;
var escala = 10;
var crs = 'EPSG:31983';

var nomeSaida = 'CAP2_USO_SOLO_ENTORNO_FIXO_500M_2018_2024_v2';
var pastaDrive = 'CAP2_DIAGNOSTICO_AMBIENTAL';

// 2. ÁREA DE ESTUDO
var carta = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var regiao = carta.geometry();

// 3. MAPA FINAL DE AUGIs
var augi = ee.Image(
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/' +
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
);

// 4. MAPBIOMAS
var mapbiomas = ee.Image(
  'projects/mapbiomas-public/assets/brazil/lulc/collection10_1/' +
  'mapbiomas_brazil_collection10_1_coverage_v1'
);

// 5. SELEÇÃO DAS BANDAS DE AUGIs
var bandasAUGI = anos.map(function(ano) {
  return 'classification_' + ano;
});

// 6. REFERÊNCIA ESPACIAL FIXA
// Valor 1: detectado como AUGI em pelo menos um ano.
// Valor 0: não incluído na união das detecções.
//
// Pixels sem dados são tratados como ausência de detecção
// para construir esta referência, não como ausência comprovada
// de área úmida.
var uniaoAUGI = augi
  .select(bandasAUGI)
  .eq(9)
  .reduce(ee.Reducer.max())
  .unmask(0)
  .clip(regiao)
  .rename('uniao_AUGI')
  .reproject({
    crs: crs,
    scale: escala
  });

// 7. DISTÂNCIA À REFERÊNCIA
// A projeção UTM permite calcular a distância em metros.
var distanciaAUGI = uniaoAUGI.distance(
  ee.Kernel.euclidean(distanciaBuffer, 'meters'),
  false
);

// 8. ENTORNO EXTERNO FIXO
// Inclui pixels até 500 m da referência.
// Exclui o interior de toda a união de AUGIs.
// Limita o resultado à área de estudo.
var entornoFixo = distanciaAUGI
  .lte(distanciaBuffer)
  .and(uniaoAUGI.eq(0))
  .selfMask()
  .clip(regiao)
  .rename('entorno_fixo_500m');

// 9. VISUALIZAÇÃO LEVE
// Não adicionar uniaoAUGI ou entornoFixo ao mapa regional:
// a visualização da reprojeção a 10 m causou o erro anterior.
Map.centerObject(carta, 7);
Map.addLayer(carta, {color: 'black'}, 'Limite DPP');

// Consultas apenas aos metadados.
print('Anos analisados', anos);
print('Distância do entorno, em metros', distanciaBuffer);
print('Bandas disponíveis no mapa de AUGIs', augi.bandNames());

// 10. ÁREA DOS PIXELS EM HECTARES
var pixelAreaHa = ee.Image.pixelArea()
  .divide(10000)
  .rename('area_ha');

// 11. EXTRAÇÃO DO USO E COBERTURA DE CADA ANO
var tabelasAnuais = anos.map(function(ano) {

  var classeAno = mapbiomas
    .select('classification_' + ano)
    .rename('class_id');

  // A mesma máscara espacial é usada em todos os anos.
  // Pixels sem informação no MapBiomas permanecem mascarados.
  var imagemCalculo = pixelAreaHa
    .addBands(classeAno)
    .updateMask(entornoFixo);

  var resultado = imagemCalculo.reduceRegion({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class_id'
    }),
    geometry: regiao,
    crs: crs,
    scale: escala,
    maxPixels: 1e13,
    tileScale: 4
  });

  var grupos = ee.List(
    ee.Dictionary(resultado).get('groups', ee.List([]))
  );

  var tabelaAno = ee.FeatureCollection(
    grupos.map(function(item) {
      item = ee.Dictionary(item);

      return ee.Feature(null, {
        year: ano,
        class_id: item.get('class_id'),
        area_ha: item.get('sum'),
        buffer_m: distanciaBuffer,
        referencia_espacial: 'uniao_AUGI_final_2018_2024',
        interior_AUGI_excluido: 1,
        sobreposicoes_contadas_uma_vez: 1,
        colecao: 'MapBiomas_10_1',
        unidade: 'ha',
        escala_extracao_m: escala,
        crs_extracao: crs
      });
    })
  );

  return tabelaAno;
});

// 12. UNIR AS TABELAS
var tabelaFinal = ee.FeatureCollection(tabelasAnuais)
  .flatten();

// Não imprimir a tabela completa nem calcular seus totais
// na Console. A conferência será feita após a exportação.

// 13. EXPORTAR PARA O GOOGLE DRIVE
Export.table.toDrive({
  collection: tabelaFinal,
  description: nomeSaida,
  folder: pastaDrive,
  fileNamePrefix: nomeSaida,
  fileFormat: 'CSV',
  selectors: [
    'year',
    'class_id',
    'area_ha',
    'buffer_m',
    'referencia_espacial',
    'interior_AUGI_excluido',
    'sobreposicoes_contadas_uma_vez',
    'colecao',
    'unidade',
    'escala_extracao_m',
    'crs_extracao'
  ]
});
