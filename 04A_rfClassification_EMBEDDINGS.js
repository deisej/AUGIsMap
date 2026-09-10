// Run smileRandomForest classifier

// define ibges' carta id
var file_name = 'depressaoPeriferica';
var file_name_out = 'depressaoPeriferica';

// mosaic name
var mosaic_name = 'EMBEDDINGS';

// output directory
var output_dir = 'ee-deisejunqueira/assets/AUGI-MAP/classification';

// define strings to be used as metadata
var samples_version = 2;   // input training samples version
var output_version =  2;  // output classification version

// number of AUI samples
var AUI_nSamples = 250;

// set years to be processed
var years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
//var years = [2017, 2024];

// read study area
var bacia = ee.FeatureCollection('projects/ee-deisejunqueira/assets/DepressaoPeriferica');
var corumbatai = ee.FeatureCollection("projects/ee-deisejunqueira/assets/BaciaCorumbatai")

// Embeddings
var embeddingsIC = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL');

// define terrain variables
// ======================================================================
// 2) Topographic variables (Raster): SRTM + Hand Merit
// ======================================================================
var srtm = ee.Image('USGS/SRTMGL1_003').clip(bacia);
var elevation = srtm.rename('elevation');
var slope = ee.Terrain.slope(srtm).rename('slope');

var meanElev = srtm.focal_mean({radius: 250, units: 'meters'});
var tpi = srtm.subtract(meanElev).rename('tpi');

// HAND REAL (MERIT Hydro) — used in pixel RF and polygon analyses
var handImg = ee.Image("MERIT/Hydro/v1_0_1").select("hnd").rename("hand").clip(bacia);

// ======================================================================
// 3) DISTANCE TO RIVERS (RASTER) — used in RF pixel and polygon metrics
// ======================================================================
// Hydrography
var riversFC = ee.FeatureCollection("projects/ee-deisejunqueira/assets/Ughri05_hidrografia")
  .filterBounds(bacia);

var riversRaster = ee.Image(0).byte().paint(riversFC, 1).rename("rivers").clip(bacia);
var distRiversImgBase = riversRaster
  .fastDistanceTransform(1000).sqrt()
  .multiply(30)
  .rename('dist_river')
  .clip(bacia);

// read palette
var vis = {
  'min': 0,
  'max': 62,
  'palette': require('users/mapbiomas/modules:Palettes.js').get('classification8')
};

///////////////////////////////////

// For classification output
var img = ee.Image([]);

// For variable importance output (merged across years)
var importanceAll = ee.FeatureCollection([]);

// for each year
years.forEach(function(year_i) {

  // read training samples
  var samples_i = ee.FeatureCollection(
    'projects/ee-deisejunqueira/assets/AUGI-MAP/training/v' + samples_version + '/' +
    file_name + '_' + year_i + '_training_' + mosaic_name + '_v' + samples_version
  );
  
  // get only AUI
  var aui_i = samples_i.filterMetadata('reference', 'equals', 9)
    .randomColumn('rand')
    .sort('rand')
    .limit(AUI_nSamples);
    
  // merge with total samples
  samples_i = samples_i.filterMetadata('reference', 'not_equals', 9).merge(aui_i)

  // read mosaic for year i
  var emb_i = embeddingsIC
    .filterDate(year_i + '-01-01', year_i + '-12-30')
    .mosaic()
    .clip(bacia);

  // add terrain bands
  emb_i = emb_i.addBands([elevation, slope, tpi, handImg, distRiversImgBase]);

  // train classifier
  var classifier = ee.Classifier.smileRandomForest({
    'numberOfTrees': 200
    //'variablesPerSplit': 20
  }).train(samples_i, 'reference', emb_i.bandNames());

  // -----------------------------
  // VARIABLE IMPORTANCE (EXPORT)
  // -----------------------------
  var explain = ee.Dictionary(classifier.explain());
  var importance = ee.Dictionary(explain.get('importance'));

  // Convert importance dictionary to a FeatureCollection (long table)
  var vars = importance.keys();
  var importanceFC_year = ee.FeatureCollection(
    vars.map(function(v) {
      v = ee.String(v);
      return ee.Feature(null, {
        year: year_i,
        variable: v,
        importance: ee.Number(importance.get(v)),
        file_name: file_name,
        samples_version: samples_version,
        output_version: output_version
      });
    })
  );

  // Merge into the global FC
  importanceAll = importanceAll.merge(importanceFC_year);

  // perform classification
  var predicted = emb_i
    .classify(classifier)
    .rename('classification_' + year_i)
    .toInt8();

  Map.addLayer(predicted, vis, 'predicted - ' + year_i);

  // store
  img = img.addBands(predicted);

});

// Optional: sort for readability in the Console
importanceAll = importanceAll.sort('year').sort('importance', false);
print('RF variable importance (all years)', importanceAll.limit(200));

// export classification
Export.image.toAsset({
  image: img,
  description: file_name_out + '_classification_' + mosaic_name + '_v' + output_version,
  assetId: output_dir + '/' + file_name_out + '_classification_' + mosaic_name + '_v' + output_version,
  pyramidingPolicy: 'mode',
  region: bacia.geometry(),
  scale: 10,
  maxPixels: 1e13
});

// export variable importance table (CSV to Google Drive)
Export.table.toDrive({
  collection: importanceAll,
  description: 'rf_importance_' + file_name_out + '_' + mosaic_name + '_v' + output_version,
  fileNamePrefix: 'rf_importance_' + file_name_out + '_' + mosaic_name + '_v' + output_version,
  fileFormat: 'CSV'
});

// 
Map.addLayer(ee.FeatureCollection("projects/ee-deisejunqueira/assets/ManuscriptPolygons_metrics"), {}, 'trainingPolys')
Map.addLayer(corumbatai, {}, 'corumbatai')
