// ============================================================
// EFEITO DOS FILTROS NOS EMBEDDINGS — DPP, 2017–2024
//
// RESULTADOS:
// 1. CSV: áreas anuais das três etapas.
// 2. CSV: áreas mantidas, retiradas e acrescentadas.
// 3. CSV: cobertura dos dados.
// 4. Três mapas binários de 2024.
// 5. Dois mapas de mudanças de 2024.
// 6. Um mapa de cobertura de 2024.
//
// COMO EXECUTAR:
// Clique em Run e execute as 9 tarefas na aba Tasks.
// Os arquivos serão enviados para o Google Drive.
//
// AUGI = classe 9.
// Este script apenas lê os assets, sem aplicar novamente filtros.
// ============================================================


// ============================================================
// BLOCO 1 — CARREGAR OS PRODUTOS E A ÁREA DE ESTUDO
// ============================================================

var raiz =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var etapas = [
  {
    nome: 'bruto',
    imagem: ee.Image(
      raiz + 'depressaoPeriferica_classification_EMBEDDINGS_v2'
    )
  },
  {
    nome: 'temporal',
    imagem: ee.Image(
      raiz +
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2'
    )
  },
  {
    nome: 'temporal_espacial',
    imagem: ee.Image(
      raiz +
      'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
    )
  }
];

var limite = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var regiao = limite.geometry();

var anos = [
  2017, 2018, 2019, 2020,
  2021, 2022, 2023, 2024
];

var anoMapa = 2024;

var pastaDrive = 'AUGI_EFEITO_FILTROS';

// Grade comum para alinhar os três produtos.
// SIRGAS 2000 / UTM zona 23S, com pixels de 10 m.
// Esta é uma grade de comparação, não necessariamente
// a grade nativa de cada asset.
//
// A reamostragem categórica usa o padrão do GEE:
// vizinho mais próximo. Não usar bilinear ou bicúbica.

var crs = 'EPSG:31983';

var transformacao = [
  10, 0, 0,
  0, -10, 0
];

var hectare = ee.Image.pixelArea().divide(10000);

// Conferir nomes das bandas e projeções no Console.
etapas.forEach(function(etapa) {
  print(
    'Bandas — ' + etapa.nome,
    etapa.imagem.bandNames()
  );

  print(
    'Projeção original — ' + etapa.nome,
    etapa.imagem
      .select('classification_2024')
      .projection()
  );
});


// ============================================================
// BLOCO 2 — PREPARAR OS MAPAS BINÁRIOS E AS MÁSCARAS
//
// 1 = AUGI.
// 0 = outra classe com dados válidos.
// Pixel mascarado = ausência de dados.
//
// A cobertura comum contém apenas os locais onde os três
// produtos possuem dados no mesmo ano.
// ============================================================

function preparar(ano) {

  var dados = etapas.map(function(etapa) {

    var classe = etapa.imagem
      .select('classification_' + ano)
      .clip(regiao);

    var valida = classe
      .mask()
      .gt(0)
      .unmask(0, false)
      .clip(regiao)
      .rename('valida');

    var augi = classe
      .eq(9)
      .unmask(0, false)
      .clip(regiao)
      .rename('AUGI');

    return {
      nome: etapa.nome,
      valida: valida,
      augi: augi
    };
  });

  var comum = dados[0].valida
    .and(dados[1].valida)
    .and(dados[2].valida);

  return {
    dados: dados,
    comum: comum
  };
}


// ============================================================
// BLOCO 3 — FUNÇÕES PARA CALCULAR ÁREAS E PERCENTUAIS
// ============================================================

function somar(imagem) {

  return imagem.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: regiao,
    crs: crs,
    crsTransform: transformacao,
    maxPixels: 1e13,
    tileScale: 4
  });
}

// Converter resultados nulos em zero.
function numero(dicionario, chave) {

  var valor = ee.Dictionary(dicionario).get(chave);

  return ee.Number(
    ee.Algorithms.If(
      ee.Algorithms.IsEqual(valor, null),
      0,
      valor
    )
  );
}

function area(mascara, nome) {

  return hectare
    .updateMask(mascara)
    .rename(nome);
}

function porcentagem(valor, base) {

  // -9999 representa percentual indefinido:
  // o denominador é zero. No R, tratar como NA.

  return ee.Algorithms.If(
    base.gt(0),
    valor.divide(base).multiply(100),
    -9999
  );
}


// ============================================================
// BLOCO 4 — CALCULAR AS ÁREAS ANUAIS DAS TRÊS ETAPAS
//
// RESULTADO: 24 linhas, uma por ano e etapa.
//
// area_AUGI_propria_ha:
// área de AUGI na cobertura válida de cada produto.
//
// area_AUGI_comum_ha:
// área de AUGI na cobertura comum aos três produtos.
//
// Para comparar o efeito dos filtros, usar a área comum.
// ============================================================

var linhasAreas = [];
var linhasMudancas = [];
var linhasCobertura = [];

anos.forEach(function(ano) {

  var preparado = preparar(ano);

  preparado.dados.forEach(function(dado) {

    var pilhaAreas = area(
      dado.valida,
      'cobertura_propria'
    )
      .addBands(
        area(
          preparado.comum,
          'cobertura_comum'
        )
      )
      .addBands(
        area(
          dado.augi.and(dado.valida),
          'AUGI_propria'
        )
      )
      .addBands(
        area(
          dado.augi.and(preparado.comum),
          'AUGI_comum'
        )
      );

    var soma = somar(pilhaAreas);

    linhasAreas.push(
      ee.Feature(null, {
        ano: ano,
        etapa: dado.nome,

        cobertura_propria_ha:
          numero(soma, 'cobertura_propria'),

        cobertura_comum_ha:
          numero(soma, 'cobertura_comum'),

        area_AUGI_propria_ha:
          numero(soma, 'AUGI_propria'),

        area_AUGI_comum_ha:
          numero(soma, 'AUGI_comum'),

        crs: crs,
        resolucao_m: 10
      })
    );
  });


  // ==========================================================
  // BLOCO 5 — MEDIR AS MUDANÇAS CAUSADAS POR CADA FILTRO
  //
  // Comparação 1: bruto versus temporal.
  // Comparação 2: temporal versus temporal + espacial.
  //
  // Mantida: AUGI antes e depois.
  // Retirada: AUGI antes, outra classe depois.
  // Acrescentada: outra classe antes, AUGI depois.
  //
  // Todas as mudanças são medidas na cobertura comum.
  // Retirada não significa, por si só, correção de erro.
  // ==========================================================

  var comparacoes = [
    [0, 1, 'efeito_temporal'],
    [1, 2, 'efeito_espacial_apos_temporal']
  ];

  comparacoes.forEach(function(par) {

    var antes = preparado.dados[par[0]].augi;
    var depois = preparado.dados[par[1]].augi;

    var pilhaMudancas = area(
      antes
        .and(depois)
        .and(preparado.comum),
      'mantida'
    )
      .addBands(
        area(
          antes
            .and(depois.not())
            .and(preparado.comum),
          'retirada'
        )
      )
      .addBands(
        area(
          antes.not()
            .and(depois)
            .and(preparado.comum),
          'acrescentada'
        )
      );

    var somaMudancas = somar(pilhaMudancas);

    var mantida = numero(
      somaMudancas,
      'mantida'
    );

    var retirada = numero(
      somaMudancas,
      'retirada'
    );

    var acrescentada = numero(
      somaMudancas,
      'acrescentada'
    );

    var areaAntes = mantida.add(retirada);
    var areaDepois = mantida.add(acrescentada);

    var variacao = areaDepois.subtract(areaAntes);

    linhasMudancas.push(
      ee.Feature(null, {
        ano: ano,
        comparacao: par[2],
        dominio: 'cobertura_comum_tres_etapas',

        AUGI_antes_ha: areaAntes,
        AUGI_depois_ha: areaDepois,

        mantida_ha: mantida,
        retirada_ha: retirada,
        acrescentada_ha: acrescentada,

        variacao_liquida_ha: variacao,

        retirada_pct_area_antes:
          porcentagem(retirada, areaAntes),

        acrescentada_pct_area_antes:
          porcentagem(acrescentada, areaAntes),

        variacao_liquida_pct:
          porcentagem(variacao, areaAntes)
      })
    );
  });


  // ==========================================================
  // BLOCO 6 — CONFERIR A COBERTURA DOS DADOS
  //
  // Detecta mudanças nas máscaras dos produtos.
  // Essas mudanças não devem ser confundidas com retirada
  // de AUGI pelo filtro.
  //
  // Códigos:
  // 0 = nenhum produto com dados.
  // 1 = somente bruto.
  // 2 = somente temporal.
  // 3 = bruto e temporal.
  // 4 = somente final.
  // 5 = bruto e final.
  // 6 = temporal e final.
  // 7 = os três produtos com dados.
  // ==========================================================

  var cobertura = preparado.dados[0].valida
    .add(
      preparado.dados[1].valida.multiply(2)
    )
    .add(
      preparado.dados[2].valida.multiply(4)
    );

  var pilhaCobertura = area(
    cobertura.eq(0),
    'codigo_0'
  );

  for (var k = 1; k <= 7; k++) {
    pilhaCobertura = pilhaCobertura.addBands(
      area(
        cobertura.eq(k),
        'codigo_' + k
      )
    );
  }

  var somaCobertura = somar(pilhaCobertura);

  for (var codigo = 0; codigo <= 7; codigo++) {

    linhasCobertura.push(
      ee.Feature(null, {
        ano: ano,
        codigo: codigo,

        bruto_valido:
          (codigo & 1) ? 1 : 0,

        temporal_valido:
          (codigo & 2) ? 1 : 0,

        final_valido:
          (codigo & 4) ? 1 : 0,

        area_ha:
          numero(
            somaCobertura,
            'codigo_' + codigo
          )
      })
    );
  }
});


// ============================================================
// BLOCO 7 — EXPORTAR OS TRÊS CSVs
//
// Esses arquivos serão usados para os gráficos no R.
// ============================================================

function exportarTabela(linhas, nome) {

  Export.table.toDrive({
    collection: ee.FeatureCollection(linhas),
    description: nome,
    folder: pastaDrive,
    fileNamePrefix: nome,
    fileFormat: 'CSV'
  });
}

exportarTabela(
  linhasAreas,
  '01_areas_anuais_embeddings'
);

exportarTabela(
  linhasMudancas,
  '02_mudancas_por_filtro'
);

exportarTabela(
  linhasCobertura,
  '03_cobertura_dados'
);


// ============================================================
// BLOCO 8 — FUNÇÃO PARA EXPORTAR MAPAS
//
// Todos os mapas têm a mesma grade de comparação.
//
// 255 = ausência de dados (NoData).
// ============================================================

function exportarMapa(imagem, nome) {

  Export.image.toDrive({
    image: imagem
      .toByte()
      .unmask(255, false)
      .clip(regiao),

    description: nome,
    folder: pastaDrive,
    fileNamePrefix: nome,

    region: regiao,
    crs: crs,
    crsTransform: transformacao,

    maxPixels: 1e13,
    fileFormat: 'GeoTIFF',

    formatOptions: {
      cloudOptimized: true,
      noData: 255
    }
  });
}


// ============================================================
// BLOCO 9 — EXPORTAR OS TRÊS MAPAS BINÁRIOS DE 2024
//
// RESULTADO:
// Bruto / Temporal / Temporal + espacial.
//
// Simbologia no QGIS:
// 1 = AUGI: mesma cor nos três mapas.
// 0 = outra classe: transparente.
// 255 = NoData.
//
// Os mapas representam pixels na grade comum de comparação,
// não necessariamente os pixels nativos de cada asset.
// ============================================================

var preparadoMapa = preparar(anoMapa);

preparadoMapa.dados.forEach(function(dado) {

  var binaria = dado.augi
    .updateMask(dado.valida);

  exportarMapa(
    binaria,
    '04_AUGI_' + dado.nome + '_' + anoMapa
  );

  Map.addLayer(
    binaria.selfMask(),
    {
      palette: ['00BFC4']
    },
    dado.nome + ' — ' + anoMapa,
    false
  );
});


// ============================================================
// BLOCO 10 — EXPORTAR OS DOIS MAPAS DE MUDANÇAS DE 2024
//
// 0 = não AUGI em ambos.
// 1 = AUGI retirada.
// 2 = AUGI acrescentada.
// 3 = AUGI mantida.
// 255 = fora da cobertura comum.
//
// RESULTADO:
// Onde o temporal mudou a classificação.
// Onde o espacial mudou a classificação após o temporal.
// ============================================================

var paresMapas = [
  [0, 1, 'temporal'],
  [1, 2, 'espacial']
];

paresMapas.forEach(function(par) {

  var antes = preparadoMapa.dados[par[0]].augi;
  var depois = preparadoMapa.dados[par[1]].augi;

  var transicao = antes
    .add(depois.multiply(2))
    .updateMask(preparadoMapa.comum)
    .rename('transicao');

  exportarMapa(
    transicao,
    '05_transicao_' + par[2] + '_' + anoMapa
  );
});


// ============================================================
// BLOCO 11 — EXPORTAR O MAPA DE COBERTURA DE 2024
//
// Os códigos 0–7 são os mesmos descritos no bloco 6.
// Código 7 = cobertura comum aos três produtos.
// ============================================================

var coberturaMapa = preparadoMapa.dados[0].valida
  .add(
    preparadoMapa.dados[1].valida.multiply(2)
  )
  .add(
    preparadoMapa.dados[2].valida.multiply(4)
  )
  .rename('cobertura');

exportarMapa(
  coberturaMapa,
  '06_cobertura_' + anoMapa
);


// ============================================================
// BLOCO 12 — VISUALIZAÇÃO E ORIENTAÇÕES FINAIS
// ============================================================

Map.addLayer(
  limite.style({
    color: 'FFFFFF',
    fillColor: '00000000',
    width: 1
  }),
  {},
  'Limite da DPP'
);

Map.centerObject(limite, 7);

print(
  'Pronto: execute as 9 tarefas na aba Tasks.'
);

print(
  'Pasta de destino no Google Drive: ' + pastaDrive
);
