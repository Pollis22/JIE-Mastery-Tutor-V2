import { useState } from 'react';
import { Check, X, Loader2, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';

interface PromoCodeInputProps {
  onPromoApplied: (code: string, discount: string, promoCodeId: string) => void;
  onPromoRemoved: () => void;
  disabled?: boolean;
}

interface PromoValidationResponse {
  valid: boolean;
  promoCodeId?: string;
  code?: string;
  discount?: string;
  percentOff?: number | null;
  amountOff?: number | null;
  duration?: string;
  error?: string;
}

export function PromoCodeInput({ onPromoApplied, onPromoRemoved, disabled = false }: PromoCodeInputProps) {
  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discount: string } | null>(null);

  const validatePromo = async () => {
    if (!code.trim()) {
      setError('Please enter a promo code');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const response = await apiRequest('POST', '/api/promo/validate', { 
        code: code.toUpperCase().trim() 
      });

      const data: PromoValidationResponse = await response.json();

      if (data.valid && data.code && data.discount && data.promoCodeId) {
        setAppliedPromo({ code: data.code, discount: data.discount });
        onPromoApplied(data.code, data.discount, data.promoCodeId);
        setError('');
      } else {
        setError(data.error || 'Invalid promo code');
      }
    } catch (err: any) {
      if (err.message) {
        setError(err.message);
      } else {
        setError('Failed to validate promo code');
      }
    } finally {
      setIsValidating(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setCode('');
    setError('');
    onPromoRemoved();
  };

  if (appliedPromo) {
    return (
      <div 
        className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
        data-testid="promo-applied-badge"
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-full bg-green-100 dark:bg-green-800">
            <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
          </div>
          <Tag className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="font-medium text-green-800 dark:text-green-300" data-testid="text-promo-code">
            {appliedPromo.code}
          </span>
          <span className="text-green-600 dark:text-green-400" data-testid="text-promo-discount">
            - {appliedPromo.discount}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={removePromo}
          disabled={disabled}
          className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 p-1 h-auto"
          data-testid="button-remove-promo"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter promo code"
          className="flex-1"
          disabled={disabled || isValidating}
          onKeyDown={(e) => e.key === 'Enter' && !disabled && !isValidating && validatePromo()}
          data-testid="input-promo-code"
        />
        <Button
          onClick={validatePromo}
          disabled={disabled || isValidating || !code.trim()}
          variant="secondary"
          data-testid="button-apply-promo"
        >
          {isValidating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Apply'
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" data-testid="text-promo-error">
          <X className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}
