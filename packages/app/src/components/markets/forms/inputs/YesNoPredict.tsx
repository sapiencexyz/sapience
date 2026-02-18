import { useFormContext } from 'react-hook-form';
import { useState, useEffect } from 'react';
import ForecastOddsSlider from '~/components/shared/ForecastOddsSlider';

interface YesNoPredictProps {
  name?: string;
  disabled?: boolean;
}

export default function YesNoPredict({
  name = 'predictionValue',
  disabled = false,
}: YesNoPredictProps) {
  const { register, setValue } = useFormContext();
  const [sliderValue, setSliderValue] = useState(50); // Default to 50%

  // Update form value when slider changes - store percentage directly (0-100)
  useEffect(() => {
    setValue(name, sliderValue.toString(), { shouldValidate: true });
  }, [sliderValue, name, setValue]);

  return (
    <div className="space-y-4">
      <ForecastOddsSlider
        value={sliderValue}
        onChange={setSliderValue}
        disabled={disabled}
        label="Forecast"
      />
      {/* Hidden input for form submission */}
      <input type="hidden" {...register(name)} />
    </div>
  );
}
