// ============================================================================
// AUGI-MAP
// INTERACTIVE WETLAND DYNAMICS TOOLKIT
//
// CLASS 9 | DEPRESSÃO PERIFÉRICA
// 2017-2024
//
// MAP:
// - Annual Sentinel / MapBiomas mosaic
// - Annual AlphaEarth embeddings
// - Annual binary wetland occurrence
// - Largest connected wetland of selected year
// - Annual gain / loss
// - Frequency
// - Number of changes
// - Number of gains
// - Number of losses
//
// OBJECT ANALYSIS:
// - 8-connected wetland polygons
// - annual unique object IDs
// - object area
// - number of wetlands
// - total / mean / median / min / max area
// - largest wetland ID and area
//
// EXPORT:
// - annual summary CSV
// - individual connected wetlands CSV
//
// ============================================================================



// ============================================================================
// 0. INPUTS
// ============================================================================

var classification = ee.Image(
  'projects/ee-deisejunqueira/assets/AUGI-MAP/classification/' +
  'depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2'
);


var bacia = ee.FeatureCollection(
  'projects/ee-deisejunqueira/assets/DepressaoPeriferica'
);


var studyArea = bacia.geometry();


var targetClass = 9;


var years = [
  2017,
  2018,
  2019,
  2020,
  2021,
  2022,
  2023,
  2024
];


var OBJECT_SCALE = 10;


print('Classification:', classification);
print('Study area:', bacia);



// ============================================================================
// 1. ANNUAL REFERENCE IMAGE COLLECTIONS
// ============================================================================

var sentinelOld = ee.ImageCollection(
  'projects/mapbiomas-mosaics/assets/SENTINEL/BRAZIL/mosaics-3'
);


var sentinelNew = ee.ImageCollection(
  'projects/nexgenmap/MapBiomas2/SENTINEL/mosaics-3'
);


var embeddingsIC = ee.ImageCollection(
  'GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL'
);



// ============================================================================
// 2. REFERENCE VISUALIZATION
// ============================================================================


var sentinelVis = {
  bands: [
    'swir1_median',
    'nir_median',
    'red_median'
  ],
  gamma: 0.85,
  gain: [0.08, 0.07, 0.2]
};



var embeddingsVis = {

  bands: [
    'A01',
    'A16',
    'A09'
  ],

  min: -0.3,

  max: 0.3

};



// ============================================================================
// 3. GET SENTINEL
// ============================================================================

function getSentinel(year) {

  var collection;

  if (year <= 2023) {

    collection = sentinelOld;

  } else {

    collection = sentinelNew;

  }

  return collection
    .filter(
      ee.Filter.eq('year', year)
    )
    .filterBounds(studyArea)
    .mosaic()
    .clip(studyArea);
}



// ============================================================================
// 4. GET ALPHAEARTH
// ============================================================================

function getEmbeddings(year) {

  var start = ee.Date.fromYMD(
    year,
    1,
    1
  );

  var end = start.advance(
    1,
    'year'
  );


  return embeddingsIC
    .filterDate(
      start,
      end
    )
    .filterBounds(studyArea)
    .mosaic()
    .clip(studyArea);
}



// ============================================================================
// 5. BLACK BACKGROUND
// ============================================================================

var blackBackground = ee.Image.constant(1)
  .clip(studyArea)
  .rename('background');


var blackLayer = ui.Map.Layer(

  blackBackground,

  {
    min: 0,
    max: 1,
    palette: ['000000']
  },

  'Black background',

  true,

  1
);



// ============================================================================
// 6. STUDY AREA OUTLINE
// ============================================================================

var outlineImage = ee.Image()
  .byte()
  .paint({

    featureCollection: bacia,

    color: 1,

    width: 2

  });


var outlineLayer = ui.Map.Layer(

  outlineImage.selfMask(),

  {
    palette: ['FFFFFF']
  },

  'Depressão Periférica boundary',

  true,

  1
);



// ============================================================================
// 7. ANNUAL BINARY WETLAND OCCURRENCE
//
// 1 = class 9
// 0 = all other classes
// ============================================================================

var binaryNames = years.map(
  function(year) {

    return 'wetland_' + year;

  }
);


var wetlandBinary = classification
  .eq(targetClass)
  .rename(binaryNames)
  .uint8();


print(
  'Annual binary wetland occurrence:',
  wetlandBinary
);



// ============================================================================
// 8. ANNUAL TRANSITIONS
// ============================================================================

var lossImages = [];

var gainImages = [];

var changeImages = [];

var transitionImages = [];


for (var i = 0; i < years.length - 1; i++) {


  var year0 = years[i];

  var year1 = years[i + 1];


  var t0 = wetlandBinary.select(
    'wetland_' + year0
  );


  var t1 = wetlandBinary.select(
    'wetland_' + year1
  );


  // LOSS
  var loss = t0
    .eq(1)
    .and(t1.eq(0))
    .rename(
      'loss_' +
      year0 +
      '_' +
      year1
    )
    .uint8();


  lossImages.push(loss);


  // GAIN
  var gain = t0
    .eq(0)
    .and(t1.eq(1))
    .rename(
      'gain_' +
      year0 +
      '_' +
      year1
    )
    .uint8();


  gainImages.push(gain);


  // ANY CHANGE
  var change = t0
    .neq(t1)
    .rename(
      'change_' +
      year0 +
      '_' +
      year1
    )
    .uint8();


  changeImages.push(change);


  // 0 = stable
  // 1 = loss
  // 2 = gain
  var transition = ee.Image.constant(0)
    .where(
      loss.eq(1),
      1
    )
    .where(
      gain.eq(1),
      2
    )
    .clip(studyArea)
    .rename(
      'transition_' +
      year0 +
      '_' +
      year1
    )
    .uint8();


  transitionImages.push(
    transition
  );

}



// ============================================================================
// 9. STACK TRANSITIONS
// ============================================================================

var losses = ee.Image.cat(
  lossImages
);


var gains = ee.Image.cat(
  gainImages
);


var changes = ee.Image.cat(
  changeImages
);


var transitions = ee.Image.cat(
  transitionImages
);



// ============================================================================
// 10. TEMPORAL METRICS
// ============================================================================

var frequency = wetlandBinary
  .reduce(
    ee.Reducer.sum()
  )
  .rename('frequency')
  .uint8();


var numberChanges = changes
  .reduce(
    ee.Reducer.sum()
  )
  .rename('number_changes')
  .uint8();


var numberGains = gains
  .reduce(
    ee.Reducer.sum()
  )
  .rename('number_gains')
  .uint8();


var numberLosses = losses
  .reduce(
    ee.Reducer.sum()
  )
  .rename('number_losses')
  .uint8();



// ============================================================================
// 11. CONNECTED WETLAND OBJECT FUNCTION
//
// Uses reduceToVectors() directly.
//
// eightConnected = true
//
// No connectedComponents() maxSize limitation.
// ============================================================================

function makeWetlandObjects(year) {


  // --------------------------------------------------------------------------
  // BINARY WETLAND
  // --------------------------------------------------------------------------

  var wetland = wetlandBinary
    .select(
      'wetland_' + year
    )
    .rename('wetland')
    .selfMask()
    .clip(studyArea)
    .uint8();


  // --------------------------------------------------------------------------
  // PIXEL AREA
  // --------------------------------------------------------------------------

  var pixelArea = ee.Image.pixelArea()
    .rename('area_m2');


  // --------------------------------------------------------------------------
  // VECTOR INPUT
  // --------------------------------------------------------------------------

  var vectorInput = wetland
    .addBands(pixelArea);


  // --------------------------------------------------------------------------
  // VECTORIZE 8-CONNECTED WETLANDS
  // --------------------------------------------------------------------------

  var objectsRaw = vectorInput
    .reduceToVectors({

      reducer:
        ee.Reducer.sum(),

      geometry:
        studyArea,

      scale:
        OBJECT_SCALE,

      crs:
        classification
          .select(
            'classification_' + year
          )
          .projection(),

      geometryType:
        'polygon',

      eightConnected:
        true,

      labelProperty:
        'wetland',

      maxPixels:
        1e13,

      tileScale:
        8

    });


  // --------------------------------------------------------------------------
  // NUMBER OBJECTS
  // --------------------------------------------------------------------------

  var numberObjects =
    objectsRaw.size();


  var objectList =
    objectsRaw.toList(
      numberObjects
    );


  var indexList = ee.List(

    ee.Algorithms.If(

      numberObjects.gt(0),

      ee.List.sequence(
        0,
        numberObjects.subtract(1)
      ),

      ee.List([])

    )

  );


  // --------------------------------------------------------------------------
  // ASSIGN IDS + AREA
  // --------------------------------------------------------------------------

  var objects = ee.FeatureCollection(

    indexList.map(
      function(index) {


        index =
          ee.Number(index);


        var feature =
          ee.Feature(
            objectList.get(index)
          );


        var id =
          index.add(1);


        var areaM2 =
          ee.Number(
            feature.get('sum')
          );


        var areaHa =
          areaM2.divide(
            10000
          );


        var uid =
          ee.String(
            String(year)
          )
          .cat('_')
          .cat(
            id.format('%.0f')
          );


        return feature.set({

          year:
            year,

          wetland_id:
            id,

          wetland_uid:
            uid,

          area_m2:
            areaM2,

          area_ha:
            areaHa

        });

      }
    )

  );


  // --------------------------------------------------------------------------
  // LARGEST WETLAND
  // --------------------------------------------------------------------------

  var largest = objects
    .sort(
      'area_ha',
      false
    )
    .limit(1);


  return {

    binary:
      wetland,

    objects:
      objects,

    largest:
      largest

  };

}



// ============================================================================
// 12. GENERATE OBJECT PRODUCTS FOR ALL YEARS
// ============================================================================

var wetlandProducts = {};


var yearlySummaryList = [];


var allWetlandObjects =
  ee.FeatureCollection([]);


years.forEach(
  function(year) {


    var products =
      makeWetlandObjects(
        year
      );


    wetlandProducts[year] =
      products;


    // ------------------------------------------------------------------------
    // MERGE COMPLETE OBJECT TABLE
    // ------------------------------------------------------------------------

    allWetlandObjects =
      allWetlandObjects.merge(
        products.objects
      );


    // ------------------------------------------------------------------------
    // NUMBER OF WETLANDS
    // ------------------------------------------------------------------------

    var numberWetlands =
      products.objects.size();


    // ------------------------------------------------------------------------
    // MEAN AREA
    // ------------------------------------------------------------------------

    var meanDictionary =
      products.objects.reduceColumns({

        reducer:
          ee.Reducer.mean(),

        selectors:
          ['area_ha']

      });


    var meanAreaHa = ee.Number(

      ee.Algorithms.If(

        numberWetlands.gt(0),

        meanDictionary.get(
          'mean'
        ),

        0

      )

    );


    // ------------------------------------------------------------------------
    // MEDIAN AREA
    // ------------------------------------------------------------------------

    var medianDictionary =
      products.objects.reduceColumns({

        reducer:
          ee.Reducer.median(),

        selectors:
          ['area_ha']

      });


    var medianAreaHa = ee.Number(

      ee.Algorithms.If(

        numberWetlands.gt(0),

        medianDictionary.get(
          'median'
        ),

        0

      )

    );


    // ------------------------------------------------------------------------
    // MIN AREA
    // ------------------------------------------------------------------------

    var minDictionary =
      products.objects.reduceColumns({

        reducer:
          ee.Reducer.min(),

        selectors:
          ['area_ha']

      });


    var minAreaHa = ee.Number(

      ee.Algorithms.If(

        numberWetlands.gt(0),

        minDictionary.get(
          'min'
        ),

        0

      )

    );


    // ------------------------------------------------------------------------
    // MAX AREA
    // ------------------------------------------------------------------------

    var maxDictionary =
      products.objects.reduceColumns({

        reducer:
          ee.Reducer.max(),

        selectors:
          ['area_ha']

      });


    var maxAreaHa = ee.Number(

      ee.Algorithms.If(

        numberWetlands.gt(0),

        maxDictionary.get(
          'max'
        ),

        0

      )

    );


    // ------------------------------------------------------------------------
    // TOTAL AREA
    // ------------------------------------------------------------------------

    var totalAreaHa = ee.Number(

      ee.Algorithms.If(

        numberWetlands.gt(0),

        products.objects
          .aggregate_sum(
            'area_ha'
          ),

        0

      )

    );


    // ------------------------------------------------------------------------
    // LARGEST WETLAND
    // ------------------------------------------------------------------------

    var largestWetland =
      products.largest;


    var largestAreaHa = ee.Number(

      ee.Algorithms.If(

        numberWetlands.gt(0),

        largestWetland
          .aggregate_first(
            'area_ha'
          ),

        0

      )

    );


    var largestWetlandUID =
      ee.Algorithms.If(

        numberWetlands.gt(0),

        largestWetland
          .aggregate_first(
            'wetland_uid'
          ),

        'none'

      );


    // ------------------------------------------------------------------------
    // SUMMARY FEATURE
    // ------------------------------------------------------------------------

    var summaryFeature = ee.Feature(

      null,

      {

        year:
          year,

        number_wetlands:
          numberWetlands,

        total_area_ha:
          totalAreaHa,

        mean_area_ha:
          meanAreaHa,

        median_area_ha:
          medianAreaHa,

        min_area_ha:
          minAreaHa,

        max_area_ha:
          maxAreaHa,

        largest_area_ha:
          largestAreaHa,

        largest_wetland_uid:
          largestWetlandUID

      }

    );


    yearlySummaryList.push(
      summaryFeature
    );

  }
);



// ============================================================================
// 13. FINAL SUMMARY TABLE
// ============================================================================

var yearlyWetlandSummary =
  ee.FeatureCollection(
    yearlySummaryList
  );



// ============================================================================
// 14. PRINT SUMMARY
// ============================================================================

print(
  '==================================================='
);


print(
  'ANNUAL CONNECTED WETLAND SUMMARY:',
  yearlyWetlandSummary
);


print(
  '==================================================='
);


print(
  'Total wetland-year objects:',
  allWetlandObjects.size()
);


print(
  'First 50 connected wetlands:',
  allWetlandObjects.limit(50)
);


// Largest wetland of each year
var largestWetlandsAllYears =
  ee.FeatureCollection(
    years.map(
      function(year) {

        return wetlandProducts[year]
          .largest
          .first();

      }
    )
  );


print(
  'LARGEST WETLAND OF EACH YEAR:',
  largestWetlandsAllYears
);



// ============================================================================
// 15. VIS PARAMETERS
// ============================================================================


// annual wetland occurrence
var occurrenceVis = {

  min: 1,

  max: 1,

  palette: [
    '00FFFF'
  ]

};


// annual gain/loss
var transitionVis = {

  min: 1,

  max: 2,

  palette: [

    'D73027',

    '1A9850'

  ]

};


// frequency
var frequencyVis = {

  min: 1,

  max: 8,

  palette: [

    'FFFFCC',
    'FFEDA0',
    'FED976',
    'FEB24C',
    'FD8D3C',
    'FC4E2A',
    'E31A1C',
    '99000D'

  ]

};


// changes
var changesVis = {

  min: 1,

  max: 7,

  palette: [

    'F2F0F7',
    'DADAEB',
    'BCBDDC',
    '9E9AC8',
    '807DBA',
    '6A51A3',
    '3F007D'

  ]

};


// gains
var gainsVis = {

  min: 1,

  max: 4,

  palette: [

    'E5F5E0',
    'A1D99B',
    '41AB5D',
    '005A32'

  ]

};


// losses
var lossesVis = {

  min: 1,

  max: 4,

  palette: [

    'FFFFB2',
    'FECC5C',
    'F03B20',
    '7A0177'

  ]

};


// Largest wetland
//
// value 1 = polygon fill
// value 2 = polygon outline
var largestWetlandVis = {

  min: 1,

  max: 2,

  palette: [

    'FFD54F', // yellow fill

    'FFFFFF'  // white boundary

  ]

};



// ============================================================================
// 16. MASK SUMMARY PRODUCTS
// ============================================================================

var frequencyMasked =
  frequency
    .updateMask(
      frequency.gt(0)
    )
    .clip(studyArea);


var changesMasked =
  numberChanges
    .updateMask(
      numberChanges.gt(0)
    )
    .clip(studyArea);


var gainsMasked =
  numberGains
    .updateMask(
      numberGains.gt(0)
    )
    .clip(studyArea);


var lossesMasked =
  numberLosses
    .updateMask(
      numberLosses.gt(0)
    )
    .clip(studyArea);



// ============================================================================
// 17. LARGEST WETLAND IMAGE
//
// Yellow polygon + white outline
// ============================================================================

function getLargestWetlandImage(year) {


  var largest =
    wetlandProducts[year]
      .largest;


  var image =
    ee.Image(0)
      .byte();


  // fill
  image = image.paint(
    largest,
    1
  );


  // white boundary
  image = image.paint(
    largest,
    2,
    3
  );


  return image
    .selfMask()
    .rename(
      'largest_wetland_' + year
    )
    .clip(studyArea);

}



// ============================================================================
// 18. GET ANNUAL TRANSITION
// ============================================================================

function getAnnualTransition(year) {


  if (year === 2017) {

    return ee.Image.constant(0)
      .selfMask()
      .rename('transition');

  }


  var previousYear =
    year - 1;


  var image =
    transitions.select(

      'transition_' +
      previousYear +
      '_' +
      year

    );


  return image
    .updateMask(
      image.gt(0)
    )
    .clip(studyArea);

}



// ============================================================================
// 19. CREATE SOURCE LAYER
// ============================================================================

function makeSourceLayer(
  source,
  year
) {


  if (
    source ===
    'Sentinel | MapBiomas'
  ) {


    return ui.Map.Layer(

      getSentinel(year),

      sentinelVis,

      'Sentinel / MapBiomas | ' +
        year,

      true,

      0.9

    );

  }


  if (
    source ===
    'AlphaEarth | Embeddings'
  ) {


    return ui.Map.Layer(

      getEmbeddings(year),

      embeddingsVis,

      'AlphaEarth | ' +
        year,

      true,

      0.9

    );

  }


  return ui.Map.Layer(

    ee.Image.constant(0)
      .selfMask(),

    {},

    'No reference image',

    false

  );

}



// ============================================================================
// 20. INITIAL STATE
// ============================================================================

var selectedYear =
  2024;


var selectedSource =
  'Sentinel | MapBiomas';


var initialProducts =
  wetlandProducts[
    selectedYear
  ];



// ============================================================================
// 21. INITIAL MAP LAYERS
// ============================================================================


// Annual reference source
var sourceLayer =
  makeSourceLayer(

    selectedSource,

    selectedYear

  );


// Annual binary occurrence
var occurrenceLayer =
  ui.Map.Layer(

    initialProducts.binary,

    occurrenceVis,

    'Wetland occurrence | 2024',

    false,

    0.9

  );


// Largest connected wetland
var largestWetlandLayer =
  ui.Map.Layer(

    getLargestWetlandImage(
      2024
    ),

    largestWetlandVis,

    'Largest wetland | 2024',

    true,

    0.9

  );


// Annual gain/loss
var annualLayer =
  ui.Map.Layer(

    getAnnualTransition(
      2024
    ),

    transitionVis,

    'Gain / loss | 2023 → 2024',

    true,

    1

  );


// frequency
var frequencyLayer =
  ui.Map.Layer(

    frequencyMasked,

    frequencyVis,

    'Frequency | 2017-2024',

    false,

    1

  );


// changes
var changesLayer =
  ui.Map.Layer(

    changesMasked,

    changesVis,

    'Number of changes | 2017-2024',

    false,

    1

  );


// gains
var gainsLayer =
  ui.Map.Layer(

    gainsMasked,

    gainsVis,

    'Number of gains | 2017-2024',

    false,

    1

  );


// losses
var lossesLayer =
  ui.Map.Layer(

    lossesMasked,

    lossesVis,

    'Number of losses | 2017-2024',

    false,

    1

  );



// ============================================================================
// 22. FIXED MAP LAYER ORDER
//
// 0 black background
// 1 Sentinel / AlphaEarth
// 2 annual binary occurrence
// 3 largest wetland
// 4 annual gain/loss
// 5 frequency
// 6 number changes
// 7 number gains
// 8 number losses
// 9 boundary
//
// Connected IDs and connected-area rasters REMOVED from visualization.
// ============================================================================

Map.layers().reset([

  blackLayer,

  sourceLayer,

  occurrenceLayer,

  largestWetlandLayer,

  annualLayer,

  frequencyLayer,

  changesLayer,

  gainsLayer,

  lossesLayer,

  outlineLayer

]);



// ============================================================================
// 23. UI
// ============================================================================

var panel = ui.Panel({

  style: {

    position:
      'top-left',

    width:
      '390px',

    padding:
      '12px'

  }

});



panel.add(

  ui.Label({

    value:
      'AUGI-MAP | Wetland dynamics',

    style: {

      fontSize:
        '20px',

      fontWeight:
        'bold'

    }

  })

);


panel.add(

  ui.Label({

    value:
      'Class 9 | Depressão Periférica',

    style: {

      color:
        '#666666',

      fontSize:
        '12px',

      margin:
        '0 0 10px 0'

    }

  })

);



// ============================================================================
// 24. YEAR LABEL
// ============================================================================

var yearLabel = ui.Label({

  value:
    '2024 | transition 2023 → 2024',

  style: {

    fontSize:
      '16px',

    fontWeight:
      'bold'

  }

});


panel.add(
  yearLabel
);



// ============================================================================
// 25. LARGEST-WETLAND INFO LABEL
// ============================================================================

var largestInfoLabel = ui.Label({

  value:
    'Largest wetland: loading...',

  style: {

    fontSize:
      '12px',

    color:
      '#555555',

    margin:
      '3px 0 8px 0'

  }

});


panel.add(
  largestInfoLabel
);



// ============================================================================
// 26. FUNCTION TO UPDATE LARGEST-WETLAND TEXT
// ============================================================================

function updateLargestInfo(year) {


  var largest =
    wetlandProducts[year]
      .largest;


  var info =
    ee.Dictionary({

      uid:
        largest.aggregate_first(
          'wetland_uid'
        ),

      area:
        largest.aggregate_first(
          'area_ha'
        )

    });


  info.evaluate(
    function(result) {


      if (
        result &&
        result.area !== null
      ) {


        largestInfoLabel.setValue(

          'Largest wetland: ' +
          Number(result.area)
            .toFixed(2) +
          ' ha | ID: ' +
          result.uid

        );


      } else {


        largestInfoLabel.setValue(

          'Largest wetland: none'

        );

      }

    }
  );

}


updateLargestInfo(
  2024
);



// ============================================================================
// 27. SOURCE SELECTOR
// ============================================================================

panel.add(

  ui.Label({

    value:
      'Annual reference image',

    style: {

      fontWeight:
        'bold',

      margin:
        '6px 0 3px 0'

    }

  })

);


var sourceSelect = ui.Select({

  items: [

    'Sentinel | MapBiomas',

    'AlphaEarth | Embeddings',

    'Black background'

  ],

  value:
    selectedSource,

  style: {

    stretch:
      'horizontal'

  },


  onChange:
    function(value) {


      selectedSource =
        value;


      Map.layers().set(

        1,

        makeSourceLayer(

          selectedSource,

          selectedYear

        )

      );

    }

});


panel.add(
  sourceSelect
);



// ============================================================================
// 28. CHECKBOXES
// ============================================================================

var occurrenceCheckbox =
  ui.Checkbox({

    label:
      'Annual wetland occurrence (binary = 1)',

    value:
      false,


    onChange:
      function(value) {

        Map.layers()
          .get(2)
          .setShown(value);

      }

  });


var largestCheckbox =
  ui.Checkbox({

    label:
      'Largest connected wetland',

    value:
      true,


    onChange:
      function(value) {

        Map.layers()
          .get(3)
          .setShown(value);

      }

  });


var annualCheckbox =
  ui.Checkbox({

    label:
      'Annual gain / loss',

    value:
      true,


    onChange:
      function(value) {

        Map.layers()
          .get(4)
          .setShown(

            value &&
            selectedYear > 2017

          );

      }

  });


var frequencyCheckbox =
  ui.Checkbox({

    label:
      'Wetland frequency',

    value:
      false,


    onChange:
      function(value) {

        Map.layers()
          .get(5)
          .setShown(value);

      }

  });


var changesCheckbox =
  ui.Checkbox({

    label:
      'Number of changes',

    value:
      false,


    onChange:
      function(value) {

        Map.layers()
          .get(6)
          .setShown(value);

      }

  });


var gainsCheckbox =
  ui.Checkbox({

    label:
      'Number of gains',

    value:
      false,


    onChange:
      function(value) {

        Map.layers()
          .get(7)
          .setShown(value);

      }

  });


var lossesCheckbox =
  ui.Checkbox({

    label:
      'Number of losses',

    value:
      false,


    onChange:
      function(value) {

        Map.layers()
          .get(8)
          .setShown(value);

      }

  });



// ============================================================================
// 29. YEAR SLIDER
// ============================================================================

var yearSlider =
  ui.Slider({

    min:
      2017,

    max:
      2024,

    value:
      2024,

    step:
      1,

    style: {

      stretch:
        'horizontal'

    },


    onChange:
      function(year) {


        year =
          Math.round(year);


        selectedYear =
          year;


        var products =
          wetlandProducts[
            year
          ];


        // --------------------------------------------------------------------
        // YEAR LABEL
        // --------------------------------------------------------------------

        if (
          year === 2017
        ) {


          yearLabel.setValue(

            '2017 | first year'

          );


        } else {


          yearLabel.setValue(

            year +
            ' | transition ' +
            (year - 1) +
            ' → ' +
            year

          );

        }


        // --------------------------------------------------------------------
        // LARGEST WETLAND TEXT
        // --------------------------------------------------------------------

        updateLargestInfo(
          year
        );


        // --------------------------------------------------------------------
        // SOURCE IMAGE
        // --------------------------------------------------------------------

        Map.layers().set(

          1,

          makeSourceLayer(

            selectedSource,

            year

          )

        );


        // --------------------------------------------------------------------
        // ANNUAL BINARY OCCURRENCE
        // --------------------------------------------------------------------

        Map.layers().set(

          2,

          ui.Map.Layer(

            products.binary,

            occurrenceVis,

            'Wetland occurrence | ' +
              year,

            occurrenceCheckbox
              .getValue(),

            0.9

          )

        );


        // --------------------------------------------------------------------
        // LARGEST WETLAND
        // --------------------------------------------------------------------

        Map.layers().set(

          3,

          ui.Map.Layer(

            getLargestWetlandImage(
              year
            ),

            largestWetlandVis,

            'Largest wetland | ' +
              year,

            largestCheckbox
              .getValue(),

            0.9

          )

        );


        // --------------------------------------------------------------------
        // ANNUAL GAIN / LOSS
        // --------------------------------------------------------------------

        Map.layers().set(

          4,

          ui.Map.Layer(

            getAnnualTransition(
              year
            ),

            transitionVis,

            year === 2017

              ? 'No transition | 2017'

              : 'Gain / loss | ' +
                (year - 1) +
                ' → ' +
                year,

            annualCheckbox
              .getValue() &&
              year > 2017,

            1

          )

        );

      }

  });



// ============================================================================
// 30. YEAR CONTROL
// ============================================================================

panel.add(

  ui.Label({

    value:
      'Year',

    style: {

      fontWeight:
        'bold',

      margin:
        '12px 0 2px 0'

    }

  })

);


panel.add(
  yearSlider
);


panel.add(

  ui.Panel({

    widgets: [

      ui.Label(
        '2017',
        {
          fontSize:
            '10px'
        }
      ),

      ui.Label(
        '2024',
        {
          fontSize:
            '10px',

          textAlign:
            'right',

          stretch:
            'horizontal'
        }
      )

    ],

    layout:
      ui.Panel.Layout.flow(
        'horizontal'
      )

  })

);



// ============================================================================
// 31. ANNUAL LAYERS
// ============================================================================

panel.add(

  ui.Label({

    value:
      'Annual layers',

    style: {

      fontWeight:
        'bold',

      margin:
        '12px 0 4px 0'

    }

  })

);


panel.add(
  occurrenceCheckbox
);


panel.add(
  largestCheckbox
);


panel.add(
  annualCheckbox
);



// ============================================================================
// 32. TEMPORAL METRICS
// ============================================================================

panel.add(

  ui.Label({

    value:
      '2017–2024 metrics',

    style: {

      fontWeight:
        'bold',

      margin:
        '12px 0 4px 0'

    }

  })

);


panel.add(
  frequencyCheckbox
);


panel.add(
  changesCheckbox
);


panel.add(
  gainsCheckbox
);


panel.add(
  lossesCheckbox
);



// ============================================================================
// 33. LEGEND
// ============================================================================

function legendRow(
  color,
  text
) {


  return ui.Panel({

    widgets: [

      ui.Label({

        style: {

          backgroundColor:
            '#' + color,

          padding:
            '8px',

          margin:
            '0 6px 3px 0'

        }

      }),


      ui.Label(
        text
      )

    ],

    layout:
      ui.Panel.Layout.flow(
        'horizontal'
      )

  });

}


panel.add(

  ui.Label({

    value:
      'Annual transition',

    style: {

      fontWeight:
        'bold',

      margin:
        '12px 0 4px 0'

    }

  })

);


panel.add(

  legendRow(

    'D73027',

    'Loss | wetland → non-wetland'

  )

);


panel.add(

  legendRow(

    '1A9850',

    'Gain | non-wetland → wetland'

  )

);


panel.add(

  legendRow(

    'FFD54F',

    'Largest connected wetland'

  )

);



// ============================================================================
// 34. ADD PANEL
// ============================================================================

Map.add(
  panel
);



Map.centerObject(
  bacia,
  9
);


Map.setOptions(
  'SATELLITE'
);



// ============================================================================
// 35. EXPORT ANNUAL SUMMARY
// ============================================================================

Export.table.toDrive({

  collection:
    yearlyWetlandSummary,

  description:
    'DepressaoPeriferica_wetland_summary_2017_2024',

  fileNamePrefix:
    'DepressaoPeriferica_wetland_summary_2017_2024',

  fileFormat:
    'CSV',

  selectors: [

    'year',

    'number_wetlands',

    'total_area_ha',

    'mean_area_ha',

    'median_area_ha',

    'min_area_ha',

    'max_area_ha',

    'largest_area_ha',

    'largest_wetland_uid'

  ]

});



// ============================================================================
// 36. EXPORT ALL INDIVIDUAL WETLAND OBJECTS
//
// Connected ID/area stay in the DATA even though they are not displayed.
// ============================================================================

Export.table.toDrive({

  collection:
    allWetlandObjects,

  description:
    'DepressaoPeriferica_connected_wetlands_2017_2024',

  fileNamePrefix:
    'DepressaoPeriferica_connected_wetlands_2017_2024',

  fileFormat:
    'CSV',

  selectors: [

    'year',

    'wetland_uid',

    'wetland_id',

    'area_m2',

    'area_ha'

  ]

});



// ============================================================================
// 37. OPTIONAL EXPORT OF LARGEST WETLANDS
//
// One polygon per year.
// Uncomment if useful.
// ============================================================================

/*

Export.table.toDrive({

  collection:
    largestWetlandsAllYears,

  description:
    'DepressaoPeriferica_largest_wetland_each_year',

  fileNamePrefix:
    'DepressaoPeriferica_largest_wetland_each_year',

  fileFormat:
    'SHP'

});

*/



// ============================================================================
// 38. FINAL PRINTS
// ============================================================================

print(
  'Object analysis scale:',
  OBJECT_SCALE,
  'm'
);


print(
  'Annual summary:',
  yearlyWetlandSummary
);


print(
  'Largest wetlands:',
  largestWetlandsAllYears
);


print(
  'All connected wetland objects:',
  allWetlandObjects.limit(50)
);


print(
  'Toolkit ready.'
);
