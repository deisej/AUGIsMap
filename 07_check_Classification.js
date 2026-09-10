// load collection
var embeddings = ee.Image('projects/ee-deisejunqueira/assets/AUGI-MAP/classification/depressaoPeriferica_classification_EMBEDDINGS_v2')
var temporal = ee.Image('projects/ee-deisejunqueira/assets/AUGI-MAP/classification/depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2')
var spatial = ee.Image('projects/ee-deisejunqueira/assets/AUGI-MAP/classification/depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2')

// set years
var years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

// read palette
var vis = {
  'min': 0,
  'max': 62,
  'palette': require('users/mapbiomas/modules:Palettes.js').get('classification8')
};

years.forEach(function(year_i) {
  Map.addLayer(embeddings.select('classification_' + year_i), vis, 'embeddings ' + year_i)
  Map.addLayer(temporal.select('classification_' + year_i), vis, 'embeddings+temporal ' + year_i);
  Map.addLayer(spatial.select('classification_' + year_i), vis, 'embeddings+temporal+spatial ' + year_i);

});
