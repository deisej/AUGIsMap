library(dplyr)
options(scipen=9e3)

## dados
data <- read.csv('./table/AREA-depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2_buffer500m.csv')

## dicioinario
dict <- read.csv('./dict/mapbiomas-dict-ptbr.csv',
                 sep=';', fileEncoding = 'latin2')

## transalte
data_joined <- data %>%
  left_join(dict, by = c("class_id" = "id"))
