// ============================================================
// EXPORTAR BIBLIOTECAS DE ATRIBUTOS PARA A PCA
// Sentinel-2 e Google Satellite Embeddings
// Período: 2018–2024
// Utiliza as tabelas anuais já salvas nos Assets.
// ============================================================

// 1. Caminho correto das tabelas
var pastaAssets =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/training/v2/';

// 2. Anos dos resultados do capítulo
var anos = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

// 3. Pasta de destino no Google Drive
var pastaDrive = 'AUGI_PCA';

// ============================================================
// 4. REUNIR AS TABELAS ANUAIS
// ============================================================

function reunirTabelas(produto) {

  var tabelas = anos.map(function(ano) {

    var nomeAsset =
      'depressaoPeriferica_' + ano +
      '_training_' + produto + '_v2';

    var caminhoAsset = pastaAssets + nomeAsset;

    var tabela = ee.FeatureCollection(caminhoAsset);

    return tabela.map(function(ponto) {

      // Preservar atributos e classes originais.
      // Identificar ano e origem de cada registro.
      // Remover a geometria para reduzir o tamanho do CSV.
      return ponto
        .set('sample_id_original', ponto.id())
        .set('year', ano)
        .set('produto', produto)
        .set('source_asset', caminhoAsset)
        .setGeometry(null);

    });

  });

  return ee.FeatureCollection(tabelas).flatten();

}

// ============================================================
// 5. CONSTRUIR AS DUAS BIBLIOTECAS
// ============================================================

var embeddings = reunirTabelas('EMBEDDINGS');
var sentinel = reunirTabelas('SENTINEL');

// ============================================================
// 6. CONFERIR OS DADOS NO CONSOLE
// ============================================================

print('Exemplo — Embeddings:', embeddings.first());
print('Exemplo — Sentinel-2:', sentinel.first());

print('Registros por ano — Embeddings:',
      embeddings.aggregate_histogram('year'));

print('Registros por ano — Sentinel-2:',
      sentinel.aggregate_histogram('year'));

// ============================================================
// 7. EXPORTAR EMBEDDINGS PARA O GOOGLE DRIVE
// ============================================================

Export.table.toDrive({
  collection: embeddings,
  description: 'EMBEDDINGS_AUIS_SPECTRAL_LIBRARY',
  folder: pastaDrive,
  fileNamePrefix: 'EMBEDDINGS_AUIS_SPECTRAL_LIBRARY',
  fileFormat: 'CSV'
});

// ============================================================
// 8. EXPORTAR SENTINEL-2 PARA O GOOGLE DRIVE
// ============================================================

Export.table.toDrive({
  collection: sentinel,
  description: 'SENTINEL_AUIS_SPECTRAL_LIBRARY',
  folder: pastaDrive,
  fileNamePrefix: 'SENTINEL_AUIS_SPECTRAL_LIBRARY',
  fileFormat: 'CSV'
});
