// training samples

// define string to use as metadata
var version = 2;

// define ibges' carta id
var file_name = 'depressaoPeriferica';

// set mosaic
var mosaic_name = 'EMBEDDINGS';

// define output dir
var output_dir = 'users/deisejunqueira/AUGI-MAP/training/v2';


var years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

// loading points
var samples = ee.FeatureCollection('projects/ee-deisejunqueira/assets/AUGI-MAP/depressaoPeriferica_samplePoints_v2');

// read study area
var bacia = ee.FeatureCollection('projects/ee-deisejunqueira/assets/DepressaoPeriferica');

// Embeddings
var embeddingsIC = ee.ImageCollection('GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL');


// ======================================================================
// 2) TOPOGRAPHIC VARIABLES (RASTER): SRTM + HAND (MERIT)
// ======================================================================
var srtm = ee.Image('USGS/SRTMGL1_003').clip(bacia);
var elevation = srtm.rename('elevation');
var slope = ee.Terrain.slope(srtm).rename('slope');

var meanElev = srtm.focal_mean({radius: 250, units: 'meters'});
var tpi = srtm.subtract(meanElev).rename('tpi');

// HAND REAL (MERIT Hydro) — used in pixel-based RF and polygon-level metrics
var handImg = ee.Image("MERIT/Hydro/v1_0_1").select("hnd").rename("hand").clip(bacia);

// ======================================================================
// 3) DISTANCE TO RIVERS (RASTER) — used in pixel-based RF and polygon-level metrics
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

//Map.addLayer(distRiversImgBase, {palette: ['green', 'yellow', 'red'], min:1, max:500}, 'distRivers')

////////////////////////////
years.forEach(function(year_i) {

  // read mosaic for year i
  var emb_i = embeddingsIC.filterDate(year_i + '-01-01', year_i + '-12-30')
    .mosaic()
    .clip(bacia);

  // add terrain bands
  emb_i = emb_i.addBands([elevation, slope, tpi, handImg, distRiversImgBase]);
  
  // get training samples
  var training_i = emb_i.sampleRegions({'collection': samples,
                                         'scale': 10,
                                         'geometries': true,
                                         'tileScale': 2});
  
  // export as GEE asset
  Export.table.toAsset({'collection': training_i,
                      'description': file_name  + '_' + year_i + '_training_' + mosaic_name + '_v' + version,
                      'assetId':  output_dir + '/' + file_name  + '_' + year_i + '_training_' + mosaic_name + '_v' + version});
  
  
})
