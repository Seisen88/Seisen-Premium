import { Check } from 'lucide-react';
import { Card } from './Card';
import Button from './Button';

interface PricingCardProps {
  title: string;
  badge: string;
  price: string | number;
  originalPrice?: string | number;
  currency?: string;
  period?: string;
  features: string[];
  featured?: boolean;
  featuredLabel?: string;
  buttonText: string;
  buttonIcon?: React.ReactNode;
  onButtonClick?: () => void;
  badgeVariant?: 'default' | 'best-value';
  priceIcon?: React.ReactNode;
  stockStatusText?: string;
  stockStatusVariant?: 'in-stock' | 'low-stock' | 'out-of-stock';
  isOutOfStock?: boolean;
}

export default function PricingCard({
  title,
  badge,
  price,
  currency = '€',
  period,
  features,
  featured = false,
  featuredLabel = 'Most Popular',
  buttonText,
  buttonIcon,
  onButtonClick,
  badgeVariant = 'default',
  priceIcon,
  originalPrice,
  stockStatusText,
  stockStatusVariant = 'in-stock',
  isOutOfStock = false,
}: PricingCardProps) {
  const stockStatusStyles =
    stockStatusVariant === 'out-of-stock'
      ? 'bg-red-500/15 text-red-300 border-red-500/30'
      : stockStatusVariant === 'low-stock'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';

  return (
    <Card
      variant={featured ? 'featured' : 'hover'}
      className="relative p-6 flex flex-col"
    >
      {/* Featured Badge */}
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-medium flex items-center gap-1.5" style={{ background: 'linear-gradient(to right, var(--accent), var(--accent-hover))', color: 'var(--text-primary)' }}>
          <span style={{ color: '#fbbf24' }}>★</span>
          {featuredLabel}
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        <span
          className="inline-block px-3 py-1 rounded-full text-xs font-medium"
          style={badgeVariant === 'best-value'
            ? { backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.3)' }
            : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
          }
        >
          {badge}
        </span>
      </div>

      {/* Price */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3">
           {originalPrice && (
            <div className="relative font-medium text-xl flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
               {priceIcon ? (
                  <span className="opacity-70 grayscale flex items-center">{priceIcon}</span> 
                ) : (
                  <span>{currency}</span>
                )}
               <span>{originalPrice}</span>
               {/* Red Strikethrough Line */}
               <div className="absolute top-1/2 left-0 w-full h-[2px] bg-red-500 -rotate-3 transform origin-center"></div>
            </div>
           )}

          <div className="flex items-center gap-1">
            {priceIcon ? (
              <span className="flex items-center">{priceIcon}</span>
            ) : (
              <span className="text-2xl font-medium" style={{ color: 'var(--text-muted)' }}>{currency}</span>
            )}
            <span className="text-5xl font-bold" style={{ color: 'var(--text-primary)' }}>{price}</span>
          </div>
        </div>
        {period && <span className="text-sm block mt-1" style={{ color: 'var(--text-muted)' }}>{period}</span>}
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
            {feature}
          </li>
        ))}
      </ul>

      {stockStatusText && (
        <div className={`mb-4 text-xs font-medium border rounded-lg px-3 py-2 text-center ${stockStatusStyles}`}>
          {stockStatusText}
        </div>
      )}

      {/* Button */}
      <Button
        variant={featured ? 'primary' : 'secondary'}
        size="lg"
        className="w-full"
        onClick={onButtonClick}
        disabled={isOutOfStock}
      >
        {buttonIcon}
        {buttonText}
      </Button>
    </Card>
  );
}
