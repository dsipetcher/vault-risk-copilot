import { getRiskColor } from '@/lib/utils';

interface RiskBadgeProps {
  category: string;
  score?: number;
}

export function RiskBadge({ category, score }: RiskBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(
        category
      )}`}
    >
      {category.toUpperCase()}
      {score !== undefined && ` (${score.toFixed(1)})`}
    </span>
  );
}
