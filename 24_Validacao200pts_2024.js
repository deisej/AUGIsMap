// ============================================================
// VALIDAÇÃO AUGI — 2024 — 200 PONTOS
//
// 1. Carrega os quatro mapas de 2024.
// 2. Exclui pontos e polígonos de treinamento.
// 3. Organiza quatro estratos.
// 4. Calcula as áreas.
// 5. Sorteia 200 pixels.
// 6. Exporta os pontos completos e a ficha de interpretação.
//
// Referência a preencher manualmente:
// 9  = AUGI
// 0  = não AUGI
// 99 = inconclusivo
// ============================================================


// ============================================================
// 1. CONFIGURAÇÕES
// ============================================================

var ano = 2024;
var escala = 10;
var crs = 'EPSG:31983';

var grade = ee.Projection(crs).atScale(escala);

// Margem operacional de exclusão.
// Não representa distância comprovada de independência espacial.
var margemExclusao_m = 20;

// Regra topográfica exploratória para subdividir o grupo 0.
var limiteDeclividade = 5;
var limiteTPI = 0;
var raioTPI_m = 250;

// Sorteio de validação.
var sementeValidacao = 42;
var codigosEstratos = [10, 11, 20, 30];
var quantidadesEstratos = [60, 40, 50, 50];

var pastaDrive = 'VALIDACAO_AUGI_2024';

var root =
  'projects/ee-deisejunqueira/assets/AUGI-MAP/';

var rootClassificacao = root + 'classification/';

var carta = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);

var regiao = carta.geometry();


// ============================================================
// 2. CONJUNTOS DE TREINAMENTO
// ============================================================

var pontosOriginais = ee.FeatureCollection(
  root + 'depressaoPeriferica_samplePoints_v2'
);

var treinoEmb2024 = ee.FeatureCollection(
  root + 'training/v2/' +
  'depressaoPeriferica_2024_training_EMBEDDINGS_v2'
);

var treinoSen2024 = ee.FeatureCollection(
  root + 'training/v2/' +
  'depressaoPeriferica_2024_training_SENTINEL_v2'
);

var poligonosAUGI = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/ManuscriptPolygons_metrics'
);

print('Total de pontos originais:', pontosOriginais.size());

print(
  'Pontos originais por classe:',
  pontosOriginais.aggregate_histogram('reference')
);

print(
  'Registros Embeddings 2024 por classe:',
  treinoEmb2024.aggregate_histogram('reference')
);

print(
  'Registros Sentinel 2024 por classe:',
  treinoSen2024.aggregate_histogram('reference')
);

print('Polígonos de referência:', poligonosAUGI.size());


// ============================================================
// 3. MÁSCARA DE EXCLUSÃO
// ============================================================

// Excluir conservadoramente todos os candidatos do treinamento,
// incluindo AUGIs não selecionadas no subconjunto de 250.

var todosPontosTreinamento = pontosOriginais
  .merge(treinoEmb2024)
  .merge(treinoSen2024);

var buffersPontos = todosPontosTreinamento.map(
  function(feature) {
    return ee.Feature(
      feature.geometry().buffer(margemExclusao_m, 1)
    );
  }
);

// Excluir os polígonos inteiros e sua margem.
var buffersPoligonos = poligonosAUGI.map(
  function(feature) {
    return ee.Feature(
      feature.geometry().buffer(margemExclusao_m, 1)
    );
  }
);

var geometriasExclusao = buffersPontos
  .merge(buffersPoligonos);

// 1 = excluir; 0 = manter.
var exclusao = ee.Image.constant(0)
  .byte()
  .setDefaultProjection(grade)
  .paint(geometriasExclusao, 1)
  .rename('exclusao')
  .clip(regiao);


// ============================================================
// 4. QUATRO MAPAS DE 2024
// ============================================================

function carregarMapa(nomeAsset, nomeBanda) {
  var imagem = ee.Image(
    rootClassificacao + nomeAsset
  ).select('classification_' + ano);

  // Preservar a máscara original.
  // Zero não é uma classe temática válida nestes mapas.
  imagem = imagem.updateMask(imagem.neq(0));

  return imagem
    .rename(nomeBanda)
    .setDefaultProjection(grade)
    .clip(regiao);
}

var sentinel = carregarMapa(
  'depressaoPeriferica_classification_SENTINEL_v2',
  'sentinel'
);

var embeddings = carregarMapa(
  'depressaoPeriferica_classification_EMBEDDINGS_v2',
  'embeddings'
);

var temporal = carregarMapa(
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2',
  'temporal'
);

var finalEmb = carregarMapa(
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2',
  'final'
);

var mapas = sentinel
  .addBands(embeddings)
  .addBands(temporal)
  .addBands(finalEmb);

// Somente pixels válidos nos quatro mapas.
var coberturaComum = mapas.mask()
  .reduce(ee.Reducer.min())
  .gt(0)
  .rename('cobertura_comum');


// ============================================================
// 5. GRUPOS ANTES E DEPOIS DA EXCLUSÃO
// ============================================================

// Grupo 0: nenhum mapa indica AUGI.
// Grupo 1: Embeddings final indica AUGI.
// Grupo 2: outro mapa indica AUGI, mas o final não.

var augiEmOutros = sentinel.eq(9)
  .or(embeddings.eq(9))
  .or(temporal.eq(9));

var gruposAntes = ee.Image.constant(0)
  .byte()
  .setDefaultProjection(grade)
  .where(augiEmOutros, 2)
  .where(finalEmb.eq(9), 1)
  .rename('grupo')
  .updateMask(coberturaComum)
  .clip(regiao);

// Não usar selfMask: o grupo 0 é válido.
var gruposDepois = gruposAntes
  .updateMask(exclusao.eq(0))
  .rename('grupo');


// ============================================================
// 6. FUNÇÃO PARA CALCULAR ÁREAS
// ============================================================

function calcularAreas(imagem, nomeBanda) {
  var resultado = ee.Image.pixelArea()
    .divide(10000)
    .rename('area_ha')
    .addBands(imagem.rename(nomeBanda))
    .reduceRegion({
      reducer: ee.Reducer.sum().group({
        groupField: 1,
        groupName: nomeBanda
      }),
      geometry: regiao,
      crs: grade,
      maxPixels: 1e13,
      tileScale: 4
    });

  var lista = ee.List(
    ee.Dictionary(resultado).get('groups', ee.List([]))
  );

  return ee.Dictionary(
    lista.iterate(function(item, acumulado) {
      item = ee.Dictionary(item);

      var chave = ee.Number(item.get(nomeBanda))
        .toInt64()
        .format('%d');

      return ee.Dictionary(acumulado)
        .set(chave, item.get('sum'));
    }, ee.Dictionary({}))
  );
}


// ============================================================
// 7. TABELA DE ÁREAS DOS GRUPOS
// ============================================================

var areasAntes = calcularAreas(gruposAntes, 'grupo');
var areasDepois = calcularAreas(gruposDepois, 'grupo');

var tabelaGrupos = ee.FeatureCollection(
  ee.List([0, 1, 2]).map(function(grupo) {
    grupo = ee.Number(grupo);

    var chave = grupo.toInt64().format('%d');

    var antes = ee.Number(areasAntes.get(chave, 0));
    var depois = ee.Number(areasDepois.get(chave, 0));

    return ee.Feature(null, {
      ano: ano,
      grupo: grupo,
      area_antes_ha: antes,
      area_elegivel_ha: depois,
      area_excluida_ha: antes.subtract(depois),
      margem_exclusao_m: margemExclusao_m,
      escala_m: escala,
      crs: crs
    });
  })
);

print('Áreas dos grupos:', tabelaGrupos);


// ============================================================
// 8. REGRA TOPOGRÁFICA
// ============================================================

// Calcular antes de recortar, preservando a vizinhança.
var demTriagem = ee.Image('USGS/SRTMGL1_003')
  .select('elevation');

var declividadeTriagem = ee.Terrain.slope(demTriagem);

var mediaElevacaoTriagem = demTriagem.focalMean({
  radius: raioTPI_m,
  kernelType: 'circle',
  units: 'meters'
});

var tpiTriagem = demTriagem
  .subtract(mediaElevacaoTriagem);

// Regra exploratória, não uma classificação de AUGIs.
// Calcular na grade nativa do DEM, aproximadamente 30 m.
var regraTopografica = declividadeTriagem
  .lte(limiteDeclividade)
  .and(tpiTriagem.lte(limiteTPI))
  .reproject({crs: demTriagem.projection()})
  .unmask(0)
  .clip(regiao);


// ============================================================
// 9. QUATRO ESTRATOS
// ============================================================

// 10: grupo 0 que atende à regra topográfica.
// 11: restante do grupo 0 ou sem informação topográfica.
// 20: AUGI no Embeddings final.
// 30: AUGI em outros mapas, ausente no final.

var estratos = gruposDepois
  .multiply(0)
  .add(11)
  .where(
    gruposDepois.eq(0).and(regraTopografica.eq(1)),
    10
  )
  .where(gruposDepois.eq(1), 20)
  .where(gruposDepois.eq(2), 30)
  .rename('estrato')
  .toByte();


// ============================================================
// 10. ÁREAS DOS ESTRATOS
// ============================================================

var areasEstratos = calcularAreas(estratos, 'estrato');

var nomesEstratos = ee.Dictionary({
  '10': 'Grupo 0: atende a regra topografica',
  '11': 'Grupo 0: restante ou sem dado topografico',
  '20': 'AUGI no Embeddings final',
  '30': 'AUGI em outros mapas, ausente no final'
});

var nPlanejados = ee.Dictionary({
  '10': 60,
  '11': 40,
  '20': 50,
  '30': 50
});

var tabelaEstratos = ee.FeatureCollection(
  ee.List(codigosEstratos).map(function(codigo) {
    codigo = ee.Number(codigo);

    var chave = codigo.toInt64().format('%d');

    return ee.Feature(null, {
      ano: ano,
      estrato: codigo,
      descricao: nomesEstratos.get(chave),
      area_ha: areasEstratos.get(chave, 0),
      n_planejado: nPlanejados.get(chave),
      limite_declividade_graus: limiteDeclividade,
      limite_tpi_m: limiteTPI,
      raio_tpi_m: raioTPI_m,
      margem_exclusao_m: margemExclusao_m,
      escala_m: escala,
      crs: crs
    });
  })
);

print('Áreas dos quatro estratos:', tabelaEstratos);

print(
  'Área elegível total (ha):',
  tabelaEstratos.aggregate_sum('area_ha')
);


// ============================================================
// 11. SORTEIO DE 200 PIXELS
// ============================================================

var coordenadasGrade = ee.Image.pixelCoordinates(grade)
  .rename(['coluna', 'linha']);

var imagemSorteio = estratos
  .addBands(mapas)
  .addBands(coordenadasGrade);

var pontosSorteados = imagemSorteio.stratifiedSample({
  numPoints: 0,
  classBand: 'estrato',
  classValues: codigosEstratos,
  classPoints: quantidadesEstratos,
  region: regiao,
  projection: grade,
  scale: escala,
  seed: sementeValidacao,
  dropNulls: true,
  tileScale: 4,
  geometries: true
});

var pontosValidacao = pontosSorteados
  .randomColumn('ordem', 73)
  .map(function(feature) {
    var coordenadas = feature.geometry()
      .transform('EPSG:4326', 1)
      .coordinates();

    // Converter para inteiro antes de usar %d.
    // Isso afeta somente o identificador, não a geometria.
    var colunaID = ee.Number(feature.get('coluna'))
      .floor()
      .toInt64()
      .format('%d');

    var linhaID = ee.Number(feature.get('linha'))
      .floor()
      .toInt64()
      .format('%d');

    var identificador = ee.String('V2024_')
      .cat(colunaID)
      .cat('_')
      .cat(linhaID);

    return feature.set({
      id: identificador,
      ano: ano,
      longitude: coordenadas.get(0),
      latitude: coordenadas.get(1),
      referencia: '',
      confianca: '',
      fonte_referencia: '',
      data_imagem: '',
      observacao: '',
      seed: sementeValidacao
    });
  })
  .sort('ordem');

print('Total sorteado — esperado: 200', pontosValidacao.size());

print(
  'Pontos por estrato — esperado: 60, 40, 50, 50',
  pontosValidacao.aggregate_histogram('estrato')
);

print(
  'Número de IDs únicos — esperado: 200',
  pontosValidacao.aggregate_count_distinct('id')
);


// ============================================================
// 12. RESUMO DO SORTEIO
// ============================================================

var tabelaEstratosFinal = tabelaEstratos.map(
  function(feature) {
    var codigo = feature.get('estrato');

    var quantidade = pontosValidacao
      .filter(ee.Filter.eq('estrato', codigo))
      .size();

    return feature.set('n_sorteado', quantidade);
  }
);

print('Resumo final dos estratos:', tabelaEstratosFinal);


// ============================================================
// 13. VISUALIZAÇÃO
// ============================================================

// Mostrar apenas os pontos, sem revelar seus estratos.
Map.centerObject(carta, 8);

Map.addLayer(
  pontosValidacao.style({
    color: 'ffff00',
    pointSize: 3,
    width: 1
  }),
  {},
  '200 pontos de validação — 2024',
  true
);


// ============================================================
// 14. EXPORTAR ÁREAS DOS GRUPOS
// ============================================================

Export.table.toDrive({
  collection: tabelaGrupos,
  description: 'VALIDACAO_02_AREAS_ELEGIVEIS_2024_200pts',
  folder: pastaDrive,
  fileNamePrefix: 'VALIDACAO_02_AREAS_ELEGIVEIS_2024_200pts',
  fileFormat: 'CSV',
  selectors: [
    'ano',
    'grupo',
    'area_antes_ha',
    'area_elegivel_ha',
    'area_excluida_ha',
    'margem_exclusao_m',
    'escala_m',
    'crs'
  ]
});


// ============================================================
// 15. EXPORTAR ÁREAS E QUANTIDADES DOS ESTRATOS
// ============================================================

Export.table.toDrive({
  collection: tabelaEstratosFinal,
  description: 'VALIDACAO_03_AREAS_ESTRATOS_2024_200pts',
  folder: pastaDrive,
  fileNamePrefix: 'VALIDACAO_03_AREAS_ESTRATOS_2024_200pts',
  fileFormat: 'CSV',
  selectors: [
    'ano',
    'estrato',
    'descricao',
    'area_ha',
    'n_planejado',
    'n_sorteado',
    'limite_declividade_graus',
    'limite_tpi_m',
    'raio_tpi_m',
    'margem_exclusao_m',
    'escala_m',
    'crs'
  ]
});


// ============================================================
// 16. EXPORTAR PONTOS COMPLETOS
//
// Guardar para a análise após a interpretação.
// ============================================================

Export.table.toDrive({
  collection: pontosValidacao,
  description: 'VALIDACAO_04_PONTOS_COMPLETOS_2024_200pts',
  folder: pastaDrive,
  fileNamePrefix: 'VALIDACAO_04_PONTOS_COMPLETOS_2024_200pts',
  fileFormat: 'CSV',
  selectors: [
    'id',
    'ano',
    'estrato',
    'longitude',
    'latitude',
    'coluna',
    'linha',
    'sentinel',
    'embeddings',
    'temporal',
    'final',
    'seed',
    '.geo'
  ]
});


// ============================================================
// 17. EXPORTAR FICHA DE INTERPRETAÇÃO
//
// Sem estratos e sem resultados dos classificadores.
// ============================================================

Export.table.toDrive({
  collection: pontosValidacao,
  description: 'VALIDACAO_04_FICHA_INTERPRETACAO_2024_200pts',
  folder: pastaDrive,
  fileNamePrefix: 'VALIDACAO_04_FICHA_INTERPRETACAO_2024_200pts',
  fileFormat: 'CSV',
  selectors: [
    'id',
    'ano',
    'longitude',
    'latitude',
    'referencia',
    'confianca',
    'fonte_referencia',
    'data_imagem',
    'observacao',
    '.geo'
  ]
});
