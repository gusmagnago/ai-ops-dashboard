import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { compactNumber, euro, groupTotals } from './engine';
import type { buildUsageSeries } from './engine';
import type { FinanceEntry } from './types';

const colors = {
  Claude: '#7c5cff',
  Codex: '#007aff',
  accent: '#007aff',
  amber: '#ff9f0a',
};

export const UsageAreaChart = ({ data }: { data: ReturnType<typeof buildUsageSeries> }) => (
  <div className="chart-frame" role="img" aria-label="Usage over time chart">
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data}>
        <CartesianGrid stroke="rgba(120,120,128,0.18)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => compactNumber(Number(value))} />
        <Area dataKey="claudeTokens" name="Claude tokens" stackId="1" stroke={colors.Claude} fill={colors.Claude} fillOpacity={0.22} />
        <Area dataKey="codexTokens" name="Codex tokens" stackId="1" stroke={colors.Codex} fill={colors.Codex} fillOpacity={0.24} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

export const ContextLineChart = ({ data }: { data: ReturnType<typeof buildUsageSeries> }) => (
  <div className="chart-frame" role="img" aria-label="Context pressure chart">
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <CartesianGrid stroke="rgba(120,120,128,0.18)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => compactNumber(Number(value))} />
        <Line dataKey="tokensPerTurn" name="Tokens per turn" stroke={colors.accent} strokeWidth={2} dot={false} />
        <Line dataKey="premiumTurns" name="Premium turns" stroke={colors.amber} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

export const DailyComparisonBars = ({
  data,
  measure,
}: {
  data: ReturnType<typeof buildUsageSeries>;
  measure: 'turns' | 'tokens';
}) => {
  const claudeKey = measure === 'turns' ? 'claudeTurns' : 'claudeTokens';
  const codexKey = measure === 'turns' ? 'codexTurns' : 'codexTokens';
  const label = measure === 'turns' ? 'turns' : 'tokens';
  return (
    <div className="chart-frame" role="img" aria-label={`Daily Claude Code versus ChatGPT ${label}`}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke="rgba(120,120,128,0.18)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(value) => compactNumber(Number(value))} />
          <Bar dataKey={claudeKey} name="Claude Code" fill={colors.Claude} radius={[3, 3, 0, 0]} />
          <Bar dataKey={codexKey} name="ChatGPT / Codex" fill={colors.Codex} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export const ProviderPie = ({ rows }: { rows: ReturnType<typeof groupTotals> }) => (
  <div className="chart-frame split-chart" role="img" aria-label="Provider split chart">
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={rows} dataKey="tokens" innerRadius={62} outerRadius={92} nameKey="label" paddingAngle={4}>
          {rows.map((row) => (
            <Cell fill={row.label === 'Claude' ? colors.Claude : colors.Codex} key={row.label} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => compactNumber(Number(value))} />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

export const FinanceBarChart = ({
  rows,
}: {
  rows: Array<FinanceEntry & { remaining: number; usage: number }>;
}) => (
  <div className="chart-frame" role="img" aria-label="Budget versus actual chart">
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={rows} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid stroke="rgba(120,120,128,0.18)" horizontal={false} />
        <XAxis type="number" tickFormatter={(value) => euro(Number(value))} tickLine={false} axisLine={false} />
        <YAxis dataKey="service" type="category" width={132} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => euro(Number(value))} />
        <Bar dataKey="budgetEur" name="Budget" fill="rgba(0,122,255,0.18)" radius={[0, 6, 6, 0]} />
        <Bar dataKey="actualEur" name="Actual" fill={colors.accent} radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
