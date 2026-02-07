// compute areas to be used as reference to sort the number of per class samples

var file_name = 'depressaoPeriferica'

// input metadata
var version_output = 2;

// define classes to be assessed
var classes = [3, 4, 11, 12, 15, 18, 25, 33];

// output directory
var output_dir = 'users/deisejunqueira/AUGI-MAP';

// read study area
var carta = ee.FeatureCollection('projects/ee-deisejunqueira/assets/DepressaoPeriferica');

// read reference data in which areas will be computed
var mapbiomas = ee.Image('projects/ee-ipam-cerrado/assets/Collection_11/masks/cerrado_trainingMask_1985_2024_v4')
  .clip(carta);

// define function to compute area (skm)
var pixelArea = ee.Image.pixelArea().divide(10000);

// mapbiomas color pallete
var vis = {
    'min': 0,
    'max': 62,
    'palette': require('users/mapbiomas/modules:Palettes.js').get('classification8')
};

// plot 
Map.addLayer(mapbiomas, vis, 'reference map', true);

// define function to get class area 
// for each region 
var getArea = function(feature) {
  // get classification for the region [i]
  var mapbiomas_i = mapbiomas.clip(feature);
  // for each class [j]
  classes.forEach(function(class_j) {
    // create the reference area
    var reference_ij = pixelArea.mask(mapbiomas_i.eq(class_j));
    // compute area and insert as metadata into the feature 
    feature = feature.set(String(class_j),
                         ee.Number(reference_ij.reduceRegion({
                                      reducer: ee.Reducer.sum(),
                                      geometry: feature.geometry(),
                                      scale: 30,
                                      maxPixels: 1e13 }
                                    ).get('area')
                                  )
                              ); // end of set
                          }); // end of class_j function
  // return feature
  return feature;
}; 

var computed_obj = carta.map(getArea);
print (computed_obj);

// export computation as GEE asset
Export.table.toAsset({'collection': computed_obj, 
                      'description':  file_name + '_area_v' + version_output,
                      'assetId': output_dir + '/' + file_name + '_area_v' + version_output});
