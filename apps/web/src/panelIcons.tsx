import { AirIcon, ConveyorIcon, FanIcon, GaugeIcon, HeatIcon, LevelIcon, LightIcon, MotorIcon, PlayIcon, PowerIcon, PumpIcon, SignalIcon, SirenIcon, SnowIcon, ThermoIcon, TimerIcon, WrenchIcon, ZapIcon, type ZIcon } from './zIcons';
import type { panelIconIds } from '../../../packages/contracts/model';

type IconId = (typeof panelIconIds)[number];
/** RUN iken ikonun hareketi (Dengeli): dönen döner, motor/pompa nabız atar, bant akar, lamba/uyarı parlar. */
export type IconMotion = 'spin' | 'pulse' | 'slide' | 'glow' | 'belt';

export const panelIcons: Record<IconId, { label: string; Icon: ZIcon; motion: IconMotion }> = {
 fan: { label: 'Fan', Icon: FanIcon, motion: 'spin' },
 cog: { label: 'Motor', Icon: MotorIcon, motion: 'pulse' },
 pump: { label: 'Pompa', Icon: PumpIcon, motion: 'pulse' },
 power: { label: 'Güç', Icon: PowerIcon, motion: 'glow' },
 play: { label: 'Çalışma', Icon: PlayIcon, motion: 'pulse' },
 gauge: { label: 'Basınç', Icon: GaugeIcon, motion: 'pulse' },
 thermo: { label: 'Sıcaklık', Icon: ThermoIcon, motion: 'pulse' },
 flame: { label: 'Isıtıcı', Icon: HeatIcon, motion: 'pulse' },
 snow: { label: 'Soğutma', Icon: SnowIcon, motion: 'spin' },
 zap: { label: 'Elektrik', Icon: ZapIcon, motion: 'glow' },
 wind: { label: 'Hava', Icon: AirIcon, motion: 'slide' },
 level: { label: 'Seviye', Icon: LevelIcon, motion: 'slide' },
 conveyor: { label: 'Konveyör', Icon: ConveyorIcon, motion: 'belt' },
 light: { label: 'Lamba', Icon: LightIcon, motion: 'glow' },
 timer: { label: 'Süre', Icon: TimerIcon, motion: 'pulse' },
 signal: { label: 'Sinyal', Icon: SignalIcon, motion: 'pulse' },
 wrench: { label: 'Bakım', Icon: WrenchIcon, motion: 'pulse' },
 siren: { label: 'Uyarı', Icon: SirenIcon, motion: 'glow' },
};

/** Kart renk paleti; boş = tema rengi. Serbest renk seçici de ayrıca var. */
export const panelColors = ['', '#3d566e', '#1f7a8c', '#16804a', '#6b8e23', '#b77912', '#c8593f', '#8e44ad', '#5d6d7e'];
