// Z SCADA ikon seti ("Rozet" seçimi, 28.09.2026): ince çizgi, yuvarlak uç, 24'lük ızgara.
// Panelim kutusunda rozet içinde, menüde çıplak kullanılır. lucide-react ile aynı props (size, strokeWidth).
import type { ReactElement, ReactNode, SVGProps } from 'react';

export type ZIconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string; strokeWidth?: number | string };
export type ZIcon = ((p: ZIconProps) => ReactElement) & { displayName?: string };

function make(name: string, body: ReactNode): ZIcon {
 const C = ({ size = 24, strokeWidth = 1.6, ...rest }: ZIconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
   {body}
  </svg>
 );
 C.displayName = name;
 return C;
}

const blade = 'M12 12C11.5 8 12.5 4.5 15 4.6c2.6.1 2 4.6-3 7.4';

// Menü
export const MonitorIcon = make('Monitor', <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>);
export const PanelIcon = make('Panel', <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>);
export const BellIcon = make('Bell', <><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>);
export const HistoryIcon = make('History', <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 3.5v5h5M12 7.5V12l3 2" /></>);
export const EnergyIcon = make('Energy', <><path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" /></>);
export const ReportIcon = make('Report', <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>);
export const StudioIcon = make('Studio', <><path d="m4 20 1-4L16 5l3 3L8 19l-4 1Z" /><path d="m14 7 3 3" /></>);
export const DevicesIcon = make('Devices', <><rect x="9" y="3" width="6" height="5" rx="1.2" /><rect x="3" y="16" width="6" height="5" rx="1.2" /><rect x="15" y="16" width="6" height="5" rx="1.2" /><path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /></>);
export const TagsIcon = make('Tags', <><path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.3" /></>);
export const CommandsIcon = make('Commands', <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m7 10 3 2-3 2M12.5 15h4.5" /></>);
export const SettingsIcon = make('Settings', <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const CommIcon = make('Comm', <><circle cx="12" cy="12" r="1.8" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>);
export const MoonIcon = make('Moon', <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />);
export const SunIcon = make('Sun', <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const LogoutIcon = make('Logout', <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10" />);

// Panelim kutusu
export const FanIcon = make('Fan', <><circle cx="12" cy="12" r="9.5" /><path d={blade} /><path d={blade} transform="rotate(120 12 12)" /><path d={blade} transform="rotate(240 12 12)" /></>);
export const MotorIcon = make('Motor', <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 15V9l3.5 4 3.5-4v6" /></>);
export const PumpIcon = make('Pump', <><circle cx="11" cy="13" r="7" /><path d="M11 6h9v3.5M7 19.5 5.5 21.5h11L15 19.5" /></>);
export const PowerIcon = make('Power', <path d="M12 3v8M7.2 6.3a7.5 7.5 0 1 0 9.6 0" />);
export const PlayIcon = make('Play', <><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5 3.5-5 3.5v-7Z" /></>);
export const GaugeIcon = make('Gauge', <><path d="M4.3 17a8.5 8.5 0 1 1 15.4 0" /><path d="m12 13.5 4-4" /><circle cx="12" cy="13.5" r="1.4" /></>);
export const ThermoIcon = make('Thermo', <><path d="M10 14.2V5a2 2 0 0 1 4 0v9.2a4 4 0 1 1-4 0Z" /><path d="M12 9v8" /></>);
export const HeatIcon = make('Heat', <path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 1.5 2 1.5 3C12 8.5 12 6 12 3Z" />);
export const SnowIcon = make('Snow', <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />);
export const ZapIcon = make('Zap', <path d="M13 3 5 13.5h6L10 21l9-11h-6l0-7Z" />);
export const AirIcon = make('Air', <path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h5" />);
export const LevelIcon = make('Level', <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 12.5c2-1.3 3.5-1.3 5 0s3 1.3 5 0 2.8-1 4 0" /></>);
// Bant çizgisi `.belt`: RUN'da kesikli çizgi akar (panel.css).
export const ConveyorIcon = make('Conveyor', <><rect className="belt" x="2.5" y="9" width="19" height="7" rx="3.5" /><circle cx="6.5" cy="12.5" r="1.3" /><circle cx="12" cy="12.5" r="1.3" /><circle cx="17.5" cy="12.5" r="1.3" /></>);
export const LightIcon = make('Light', <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v1h5v-1c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />);
export const TimerIcon = make('Timer', <><circle cx="12" cy="13" r="8" /><path d="M12 13V9M10 2.5h4" /></>);
export const SignalIcon = make('Signal', <path d="M3 12h4l3-7 4 14 3-7h4" />);
export const WrenchIcon = make('Wrench', <path d="M14.5 6.5a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.3-3.3a6 6 0 0 1-7.9 7.9l-6.4 6.4a2.1 2.1 0 0 1-3-3l6.4-6.4a6 6 0 0 1 7.9-7.9l-3.3 3.3Z" />);
export const SirenIcon = make('Siren', <path d="M7 18v-6a5 5 0 0 1 10 0v6M5 18h14v3H5v-3ZM12 3v1.5M4.5 6.5l1 1M19.5 6.5l-1 1" />);
