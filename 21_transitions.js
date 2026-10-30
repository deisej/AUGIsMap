// =============================================================
// CAPÍTULO 2 — TRANSIÇÕES ANUAIS DE DETECÇÃO DE AUGIs
// VERSÃO 2: alinhamento prévio dos mapas e conferência do suporte.
//
// Produtos: Embeddings bruto e final.
// Unidade: hectares.
// 2017: apoio para a transição 2017–2018.
// Período principal: 2018–2024.
// =============================================================

// 1. ÁREA DE ESTUDO
var regiao = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var geometria = regiao.geometry();

// 2. MAPAS
var raiz =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/';

var bruto = ee.Image(
  raiz + 'depressaoPeriferica_classification_EMBEDDINGS_v2'
);

var final = ee.Image(
  raiz +
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
);

var anos = [
  2017, 2018, 2019, 2020,
  2021, 2022, 2023, 2024
];

var bandas = anos.map(function(ano) {
  return 'classification_' + ano;
});

// 3. GRADE COMUM DE 10 METROS
// SIRGAS 2000 / UTM zona 23S.
// Reamostragem padrão: vizinho mais próximo.
var crs = 'EPSG:31983';

var transformacao = [
  10, 0, 0,
  0, -10, 0
];

// Alinhar mapas e máscaras ANTES das comparações.
bruto = bruto
  .select(bandas)
  .reproject({
    crs: crs,
    crsTransform: transformacao
  });

final = final
  .select(bandas)
  .reproject({
    crs: crs,
    crsTransform: transformacao
  });

// 4. SUPORTE VÁLIDO COMUM
// Pixels válidos nos dois produtos e nos oito anos.
// Pixels sem dados são excluídos pelo suporte.
var mascaraBruto = bruto
  .mask()
  .reduce(ee.Reducer.min());

var mascaraFinal = final
  .mask()
  .reduce(ee.Reducer.min());

var suporte = mascaraBruto
  .and(mascaraFinal)
  .unmask(0, false)
  .rename('suporte');

// Área dos pixels em hectares.
var ha = ee.Image.pixelArea().divide(10000);

// 5. FUNÇÃO DE SOMA
function somar(imagem) {
  return imagem.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: geometria,
    crs: crs,
    crsTransform: transformacao,
    maxPixels: 1e13,
    tileScale: 4
  });
}

var areaRegiao = somar(
  ha.rename('area_regiao_grade_ha')
);

// 6. PRODUTOS
var produtos = [
  {
    nome: 'embeddings_bruto',
    imagem: bruto
  },
  {
    nome: 'embeddings_final',
    imagem: final
  }
];

var linhas = [];

// 7. TRANSIÇÕES ANUAIS
produtos.forEach(function(produto) {

  for (var i = 1; i < anos.length; i++) {

    var anoInicial = anos[i - 1];
    var anoFinal = anos[i];

    // Classe 9 = AUGI nestes mapas.
    var anterior = produto.imagem
      .select('classification_' + anoInicial)
      .eq(9)
      .unmask(0, false);

    var atual = produto.imagem
      .select('classification_' + anoFinal)
      .eq(9)
      .unmask(0, false);

    // O suporte exclui pixels originalmente sem dados.
    function area(condicao, nome) {
      return ha
        .multiply(condicao)
        .multiply(suporte)
        .rename(nome);
    }

    var soma = somar(
      ee.Image.cat([

        // AUGI nos dois anos.
        area(
          anterior.and(atual),
          'manutencao_ha'
        ),

        // Não AUGI → AUGI.
        area(
          anterior.not().and(atual),
          'ganho_deteccao_ha'
        ),

        // AUGI → não AUGI.
        area(
          anterior.and(atual.not()),
          'perda_deteccao_ha'
        ),

        // Não AUGI nos dois anos.
        area(
          anterior.not().and(atual.not()),
          'ausencia_estavel_ha'
        ),

        area(anterior, 'area_inicial_ha'),

        area(atual, 'area_final_ha'),

        ha
          .multiply(suporte)
          .rename('suporte_comum_ha')
      ])
    );

    var manutencao = ee.Number(
      soma.get('manutencao_ha')
    );

    var ganho = ee.Number(
      soma.get('ganho_deteccao_ha')
    );

    var perda = ee.Number(
      soma.get('perda_deteccao_ha')
    );

    var ausencia = ee.Number(
      soma.get('ausencia_estavel_ha')
    );

    var inicial = ee.Number(
      soma.get('area_inicial_ha')
    );

    var fim = ee.Number(
      soma.get('area_final_ha')
    );

    var suporteHa = ee.Number(
      soma.get('suporte_comum_ha')
    );

    var regiaoHa = ee.Number(
      areaRegiao.get('area_regiao_grade_ha')
    );

    // Conferência: as quatro categorias devem somar o suporte.
    var erroParticao = suporteHa.subtract(
      manutencao
        .add(ganho)
        .add(perda)
        .add(ausencia)
    );

    var alertaFiltro =
      produto.nome === 'embeddings_final' &&
      anoFinal >= 2023
        ? 'consultar_limitacoes_filtro_terminal_capitulo_1'
        : 'nao_aplicavel';

    var linha = ee.Feature(null, soma).set({

      produto: produto.nome,

      ano_inicial: anoInicial,

      ano_final: anoFinal,

      transicao: anoInicial + '-' + anoFinal,

      papel_2017:
        anoInicial === 2017
          ? 'apoio'
          : 'periodo_principal',

      saldo_deteccao_ha:
        ganho.subtract(perda),

      // Os três erros devem ser próximos de zero.
      erro_fechamento_inicial_ha:
        inicial.subtract(manutencao.add(perda)),

      erro_fechamento_final_ha:
        fim.subtract(manutencao.add(ganho)),

      erro_particao_suporte_ha:
        erroParticao,

      area_regiao_grade_ha:
        regiaoHa,

      cobertura_suporte_pct:
        suporteHa.divide(regiaoHa).multiply(100),

      classe_AUGI: 9,

      unidade: 'ha',

      crs: crs,

      escala_m: 10,

      suporte:
        'valido_em_ambos_produtos_2017_2024',

      alerta_filtro:
        alertaFiltro,

      interpretacao:
        'transicao_de_deteccao_nao_perda_ambiental_comprovada'
    });

    linhas.push(linha);
  }
});

// 8. EXPORTAÇÃO
// Sem vetorização e sem avaliação pesada no Console.
Export.table.toDrive({

  collection: ee.FeatureCollection(linhas),

  description:
    'CAP2_TRANSICOES_AUGI_BRUTO_FINAL_2017_2024_v2',

  folder: 'CAP2_AUGI',

  fileNamePrefix:
    'CAP2_TRANSICOES_AUGI_BRUTO_FINAL_2017_2024_v2',

  fileFormat: 'CSV',

  selectors: [
    'produto',
    'ano_inicial',
    'ano_final',
    'transicao',
    'papel_2017',
    'manutencao_ha',
    'ganho_deteccao_ha',
    'perda_deteccao_ha',
    'ausencia_estavel_ha',
    'area_inicial_ha',
    'area_final_ha',
    'saldo_deteccao_ha',
    'suporte_comum_ha',
    'area_regiao_grade_ha',
    'cobertura_suporte_pct',
    'erro_particao_suporte_ha',
    'erro_fechamento_inicial_ha',
    'erro_fechamento_final_ha',
    'classe_AUGI',
    'unidade',
    'crs',
    'escala_m',
    'suporte',
    'alerta_filtro',
    'interpretacao'
  ]
});

print(
  'Tarefa v2 criada. Abra Tasks e execute a exportação. ' +
  'O CSV será salvo na pasta CAP2_AUGI do Google Drive.'
);
