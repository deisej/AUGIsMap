library(dplyr)
options(scipen=9e3)

## dados
data <- read.csv('./table/AREA-depressaoPeriferica_classification_EMBEDDINGS_v2_temporal_v2_spatial_v2_fundiario.csv')

## dicioinario
dict <- read.csv('./dict/legenda_fundiario_2025.csv',
                 sep=';', fileEncoding = 'latin2')

## transalte
data_joined <- data %>%
  left_join(dict, by = c("territory" = "id")) %>%
  filter(class_id == 9)
