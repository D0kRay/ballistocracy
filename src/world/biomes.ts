export type BiomeId = 'jungle' | 'desert' | 'snow' | 'city' | 'industrial' | 'volcano';
export type FarShape = 'mountains' | 'dunes' | 'skyline' | 'factories' | 'peaks' | 'volcano';
export type NearShape = 'palms' | 'cacti' | 'pines' | 'rubble' | 'pipes' | 'rocks';
export type Weather = 'none' | 'rain' | 'sand' | 'snow' | 'ash' | 'smog';

export interface Biome {
  id: BiomeId;
  name: string;
  skyTop: string;
  skyBottom: string;
  sun: string | null;
  cloud: string;
  far: string;
  farShape: FarShape;
  mid: string;
  near: string;
  nearShape: NearShape;
  dirt: string;
  dirtDark: string;
  top: string; // grass / sand / snow cap
  topDark: string;
  brick: string;
  brickDark: string;
  wood: string;
  metal: string;
  weather: Weather;
  liquid: string; // acid / lava pools
}

export const BIOMES: readonly Biome[] = [
  {
    id: 'jungle', name: 'JUNGLE', skyTop: '#2a6fb8', skyBottom: '#a8e0f0', sun: '#fff4b0', cloud: '#ffffff',
    far: '#4a8a8a', farShape: 'mountains', mid: '#2f6b3a', near: '#173d1e', nearShape: 'palms',
    dirt: '#7a4a28', dirtDark: '#4e2c16', top: '#3fae3a', topDark: '#23752a',
    brick: '#8a8a7a', brickDark: '#55554a', wood: '#9a6a3a', metal: '#6a7480', weather: 'none', liquid: '#7cf04a',
  },
  {
    id: 'desert', name: 'DESERT', skyTop: '#e07a30', skyBottom: '#f8d890', sun: '#fff8d0', cloud: '#f8e8c8',
    far: '#c08050', farShape: 'dunes', mid: '#b06a3a', near: '#6a3a1e', nearShape: 'cacti',
    dirt: '#c8964e', dirtDark: '#8a6030', top: '#f0d08a', topDark: '#c8a060',
    brick: '#b8885a', brickDark: '#7a5432', wood: '#8a5a2a', metal: '#7a7468', weather: 'sand', liquid: '#7cf04a',
  },
  {
    id: 'snow', name: 'ARCTIC', skyTop: '#5878b0', skyBottom: '#d8e4f0', sun: null, cloud: '#f0f4ff',
    far: '#9aaccc', farShape: 'peaks', mid: '#6a80a8', near: '#2a3a52', nearShape: 'pines',
    dirt: '#6a6a78', dirtDark: '#404050', top: '#f4f8ff', topDark: '#b8c8e0',
    brick: '#8890a0', brickDark: '#545a68', wood: '#7a5a3a', metal: '#7a8898', weather: 'snow', liquid: '#7ce0f0',
  },
  {
    id: 'city', name: 'RUINED CITY', skyTop: '#2a1a48', skyBottom: '#d0607a', sun: '#ffd0a0', cloud: '#a06080',
    far: '#4a2a5a', farShape: 'skyline', mid: '#2e1c3c', near: '#140c1c', nearShape: 'rubble',
    dirt: '#5a5458', dirtDark: '#38343a', top: '#7a7478', topDark: '#5a5458',
    brick: '#9a4a3a', brickDark: '#5e2a22', wood: '#7a5a3a', metal: '#5a6470', weather: 'rain', liquid: '#7cf04a',
  },
  {
    id: 'industrial', name: 'FACTORY', skyTop: '#5a4a2a', skyBottom: '#d8a050', sun: '#ffe080', cloud: '#a08a60',
    far: '#6a5a3a', farShape: 'factories', mid: '#4a3e28', near: '#221c14', nearShape: 'pipes',
    dirt: '#5e4e3a', dirtDark: '#3a3024', top: '#7e6e52', topDark: '#5e4e3a',
    brick: '#7a6a5a', brickDark: '#4a3e34', wood: '#8a6a3a', metal: '#6e7478', weather: 'smog', liquid: '#b8f040',
  },
  {
    id: 'volcano', name: 'VOLCANO', skyTop: '#1a0a0a', skyBottom: '#c03a1a', sun: null, cloud: '#5a2a20',
    far: '#4a1a14', farShape: 'volcano', mid: '#30100c', near: '#140606', nearShape: 'rocks',
    dirt: '#4a3a34', dirtDark: '#2a201c', top: '#6a4a3a', topDark: '#4a3028',
    brick: '#5a4a44', brickDark: '#362c28', wood: '#6a4a2a', metal: '#5a5458', weather: 'ash', liquid: '#ff7020',
  },
];

export function biomeById(id: BiomeId): Biome {
  return BIOMES.find((b) => b.id === id) ?? BIOMES[0];
}
