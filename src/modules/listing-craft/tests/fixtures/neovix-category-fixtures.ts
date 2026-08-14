export interface NeovixCategoryFixture {
  readonly category: string;
  readonly fieldIds: readonly string[];
  readonly expectedLabels: readonly string[];
  readonly featurePriority: readonly string[];
}

export const neovixCategoryFixtures: readonly NeovixCategoryFixture[] = Object.freeze([
  { category: 'TELEVISION', fieldIds: ['model', 'brand', 'product_type', 'screen_size', 'display_technology', 'resolution', 'processor', 'hdr', 'smart_platform', 'gaming_features', 'remote_control', 'series'], expectedLabels: ['Model', 'Brand', 'Type', 'Capacity', 'Key Technologies', 'Programs / Functions', 'Control', 'Version'], featurePriority: ['display_technology', 'resolution', 'processor', 'hdr', 'gaming_features', 'smart_platform'] },
  { category: 'AIR_PURIFIER', fieldIds: ['model', 'brand', 'product_type', 'water_tank_capacity', 'filtration', 'additional_filters', 'particle_capture_claim', 'water_treatment', 'air_projection', 'sensors', 'operating_modes', 'controls', 'connectivity', 'design', 'finish'], expectedLabels: ['Model', 'Brand', 'Type', 'Capacity', 'Key Technologies', 'Programs / Functions', 'Control', 'Design', 'Finish'], featurePriority: ['filtration', 'additional_filters', 'particle_capture_claim', 'water_treatment', 'air_projection', 'sensors', 'operating_modes', 'controls', 'connectivity', 'design'] },
  { category: 'VACUUM', fieldIds: ['model', 'brand', 'product_type', 'bin_capacity', 'suction', 'runtime', 'filtration', 'cleaner_heads', 'modes', 'control', 'design', 'finish'], expectedLabels: ['Model', 'Brand', 'Type', 'Capacity', 'Key Technologies', 'Programs / Functions', 'Control', 'Design', 'Finish'], featurePriority: ['suction', 'runtime', 'filtration', 'cleaner_heads', 'modes', 'control', 'design'] },
  { category: 'BEAUTY', fieldIds: ['model', 'brand', 'product_type', 'power', 'airflow', 'attachments', 'temperature_control', 'modes', 'hair_compatibility', 'control', 'design', 'finish'], expectedLabels: ['Model', 'Brand', 'Type', 'Key Technologies', 'Programs / Functions', 'Control', 'Design', 'Finish'], featurePriority: ['power', 'airflow', 'attachments', 'temperature_control', 'modes', 'hair_compatibility', 'control'] },
  { category: 'GENERIC', fieldIds: ['model', 'brand', 'product_type', 'capacity', 'technology', 'functions', 'control', 'design', 'finish', 'version'], expectedLabels: ['Model', 'Brand', 'Type', 'Capacity', 'Key Technologies', 'Programs / Functions', 'Control', 'Design', 'Finish', 'Version'], featurePriority: ['technology', 'functions', 'capacity', 'control', 'design'] },
]);
