// ============================================================
// ÁREAS, MUDANÇAS ANUAIS E CONCORDÂNCIA ESPACIAL
// Período: 2018–2024
// Classe AUGI: 9
// Grade original conferida: EPSG:4326, nominalmente 10 m
// ============================================================

// 1. CONFIGURAÇÕES

var raiz =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var anos = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

var areaEstudo = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var geometria = areaEstudo.geometry();

var produtos = [
  {
    nome: 'SENTINEL',
    imagem: ee.Image(
      raiz + 'depressaoPeriferica_classification_SENTINEL_v2'
    )
  },
  {
    nome: 'EMBEDDINGS_BRUTO',
    imagem: ee.Image(
      raiz + 'depressaoPeriferica_classification_EMBEDDINGS_v2'
    )
  },
  {
    nome: 'EMBEDDINGS_TEMPORAL',
    imagem: ee.Image(
      raiz +
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2'
    )
  },
  {
    nome: 'EMBEDDINGS_FINAL',
    imagem: ee.Image(
      raiz +
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
    )
  }
];

// Transformação original, idêntica nos 28 registros conferidos.
// Mantém tamanho, origem e alinhamento dos pixels.
var crs = 'EPSG:4326';

var grade = [
   0.00008983152841195215, 0, -49.628775344109144,
   0, -0.00008983152841195215, -21.235634327415017
];

var hectares = ee.Image.pixelArea().divide(10000);

// ============================================================
// 2. FUNÇÕES AUXILIARES
// ============================================================

function anual(produto, ano) {
  return produto.imagem.select('classification_' + ano);
}

function cobertura(imagem) {
  // Máscara original: 1 onde há dado, 0 onde não há.
  return imagem.mask()
    .gt(0)
    .unmask(0, false)
    .rename('cobertura');
}

function augi(imagem) {
  // Zero aqui é indicador de ausência de detecção.
  // Toda análise será limitada à cobertura válida correspondente.
  return imagem.eq(9)
    .unmask(0, false)
    .rename('augi');
}

function somarAreas(indicadores) {
  // Cada banda é um indicador binário multiplicado por hectares.
  // As reduções usam exatamente a mesma grade.
  return ee.Image.cat(indicadores)
    .multiply(hectares)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geometria,
      crs: crs,
      crsTransform: grade,
      maxPixels: 1e13,
      tileScale: 4
    });
}

// ============================================================
// 3. COBERTURAS FIXAS E COBERTURAS ANUAIS
// ============================================================

// Cobertura fixa de cada produto: interseção de seus sete anos.
produtos.forEach(function(produto) {

  var fixa = cobertura(anual(produto, anos[0]));

  anos.slice(1).forEach(function(ano) {
    fixa = fixa.and(cobertura(anual(produto, ano)));
  });

  produto.coberturaFixa = fixa;
});

// Cobertura compartilhada pelos quatro produtos e sete anos.
var fixaTodos = produtos[0].coberturaFixa;

produtos.slice(1).forEach(function(produto) {
  fixaTodos = fixaTodos.and(produto.coberturaFixa);
});

// Cobertura compartilhada pelos quatro produtos em cada ano.
var comumPorAno = {};

anos.forEach(function(ano) {

  var comum = cobertura(anual(produtos[0], ano));

  produtos.slice(1).forEach(function(produto) {
    comum = comum.and(cobertura(anual(produto, ano)));
  });

  comumPorAno[ano] = comum;
});

// ============================================================
// 4. ÁREAS ANUAIS E AUDITORIA DAS COBERTURAS
// ============================================================

var linhasAreas = [];

produtos.forEach(function(produto) {

  anos.forEach(function(ano) {

    var imagem = anual(produto, ano);
    var valido = cobertura(imagem);
    var deteccao = augi(imagem);
    var propriaFixa = produto.coberturaFixa;
    var comumAnual = comumPorAno[ano];

    var valores = somarAreas([
      valido.rename('cobertura_original_ha'),

      propriaFixa.rename('cobertura_fixa_produto_ha'),

      comumAnual.rename('cobertura_comum_ano_ha'),

      fixaTodos.rename('cobertura_fixa_todos_ha'),

      deteccao.and(valido)
        .rename('augi_cobertura_original_ha'),

      deteccao.and(propriaFixa)
        .rename('augi_cobertura_fixa_produto_ha'),

      deteccao.and(comumAnual)
        .rename('augi_cobertura_comum_ano_ha'),

      deteccao.and(fixaTodos)
        .rename('augi_cobertura_fixa_todos_ha')
    ]);

    linhasAreas.push(
      ee.Feature(null, valores).set({
        produto: produto.nome,
        ano: ano,
        crs: crs,
        grade: 'original_alinhada',
        classe_augi: 9
      })
    );

  });

});

// ============================================================
// 5. MUDANÇAS ENTRE ANOS CONSECUTIVOS
// ============================================================

// Cada produto usa sua cobertura fixa de 2018–2024.
// Assim, a ausência de dados não vira perda de detecção.

var linhasMudancas = [];

produtos.forEach(function(produto) {

  for (var i = 1; i < anos.length; i++) {

    var anoInicial = anos[i - 1];
    var anoFinal = anos[i];

    var a = augi(anual(produto, anoInicial));
    var b = augi(anual(produto, anoFinal));
    var suporte = produto.coberturaFixa;

    var valores = somarAreas([
      suporte.rename('cobertura_analisada_ha'),

      a.and(suporte).rename('area_inicial_ha'),

      b.and(suporte).rename('area_final_ha'),

      a.and(b).and(suporte)
        .rename('persistencia_ha'),

      a.not().and(b).and(suporte)
        .rename('ganho_deteccao_ha'),

      a.and(b.not()).and(suporte)
        .rename('perda_deteccao_ha'),

      a.not().and(b.not()).and(suporte)
        .rename('ausencia_nos_dois_ha')
    ]);

    var inicial = ee.Number(valores.get('area_inicial_ha'));
    var final = ee.Number(valores.get('area_final_ha'));
    var ganho = ee.Number(valores.get('ganho_deteccao_ha'));
    var perda = ee.Number(valores.get('perda_deteccao_ha'));

    linhasMudancas.push(
      ee.Feature(null, valores).set({
        produto: produto.nome,
        ano_inicial: anoInicial,
        ano_final: anoFinal,
        suporte: 'fixo_produto_2018_2024',

        saldo_deteccao_ha: ganho.subtract(perda),

        // Deve ficar próximo de zero:
        // final - inicial = ganho - perda.
        erro_balanco_ha: final.subtract(inicial)
          .subtract(ganho.subtract(perda))
      })
    );

  }

});

// ============================================================
// 6. CONCORDÂNCIA ESPACIAL EM 2024
// ============================================================

// Os três pares usam a MESMA cobertura comum de 2024.
var pares = [
  [0, 1], // Sentinel x embeddings bruto
  [0, 3], // Sentinel x embeddings final
  [1, 3]  // Embeddings bruto x final
];

var linhasConcordancia = [];
var suporte2024 = comumPorAno[2024];

pares.forEach(function(par) {

  var produtoA = produtos[par[0]];
  var produtoB = produtos[par[1]];

  var a = augi(anual(produtoA, 2024));
  var b = augi(anual(produtoB, 2024));

  var valores = somarAreas([
    suporte2024.rename('cobertura_analisada_ha'),

    a.and(suporte2024).rename('area_a_ha'),

    b.and(suporte2024).rename('area_b_ha'),

    a.and(b).and(suporte2024)
      .rename('compartilhada_ha'),

    a.and(b.not()).and(suporte2024)
      .rename('exclusiva_a_ha'),

    a.not().and(b).and(suporte2024)
      .rename('exclusiva_b_ha'),

    a.or(b).and(suporte2024)
      .rename('uniao_deteccoes_ha'),

    a.not().and(b.not()).and(suporte2024)
      .rename('ausencia_nos_dois_ha')
  ]);

  var intersecao = ee.Number(valores.get('compartilhada_ha'));
  var uniao = ee.Number(valores.get('uniao_deteccoes_ha'));

  var somaAreas = ee.Number(valores.get('area_a_ha'))
    .add(ee.Number(valores.get('area_b_ha')));

  linhasConcordancia.push(
    ee.Feature(null, valores).set({
      produto_a: produtoA.nome,
      produto_b: produtoB.nome,
      ano: 2024,
      suporte: 'comum_quatro_produtos_2024',

      jaccard_percentual: ee.Algorithms.If(
        uniao.gt(0),
        intersecao.divide(uniao).multiply(100),
        null
      ),

      dice_percentual: ee.Algorithms.If(
        somaAreas.gt(0),
        intersecao.multiply(2).divide(somaAreas).multiply(100),
        null
      )
    })
  );

});

// ============================================================
// 7. EXPORTAR OS TRÊS RESULTADOS
// ============================================================

// Evitar imprimir as tabelas calculadas no Console:
// as reduções regionais serão executadas nas tarefas de exportação.

Export.table.toDrive({
  collection: ee.FeatureCollection(linhasAreas),
  description: 'CAP2_02_AREAS_COBERTURAS',
  folder: 'AUGI_CAP2',
  fileNamePrefix: 'CAP2_02_AREAS_COBERTURAS',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: ee.FeatureCollection(linhasMudancas),
  description: 'CAP2_03_MUDANCAS_ANUAIS',
  folder: 'AUGI_CAP2',
  fileNamePrefix: 'CAP2_03_MUDANCAS_ANUAIS',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: ee.FeatureCollection(linhasConcordancia),
  description: 'CAP1_03_CONCORDANCIA_2024',
  folder: 'AUGI_CAP2',
  fileNamePrefix: 'CAP1_03_CONCORDANCIA_2024',
  fileFormat: 'CSV'
});

print('Três exportações preparadas. Execute-as na aba Tasks.');

// ============================================================
// 8. VISUALIZAÇÃO OPCIONAL DA CONCORDÂNCIA DOS PRODUTOS BRUTOS
// ============================================================

// 0: ausência nos dois
// 1: exclusivo Sentinel
// 2: exclusivo embeddings bruto
// 3: compartilhado

var sentinel2024 = augi(anual(produtos[0], 2024));
var embeddings2024 = augi(anual(produtos[1], 2024));

var concordanciaMapa = sentinel2024
  .add(embeddings2024.multiply(2))
  .updateMask(suporte2024)
  .clip(areaEstudo);

Map.centerObject(areaEstudo, 7);

Map.addLayer(
  concordanciaMapa.selfMask(),
  {
    min: 1,
    max: 3,
    palette: ['e64b35', '3182bd', '8e44ad']
  },
  'Concordância 2024 — bruto',
  false
);
