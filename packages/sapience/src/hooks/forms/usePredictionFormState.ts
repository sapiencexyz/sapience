import { useState, useCallback } from 'react';

export interface PredictionFormData {
  predictionValue: string | number;
  wagerAmount: string;
}

export type ActiveTab = 'predict' | 'wager';

interface UsePredictionFormStateProps {
  initialFormData: PredictionFormData;
  initialActiveTab?: ActiveTab;
}

export function usePredictionFormState({
  initialFormData,
  initialActiveTab = 'predict',
}: UsePredictionFormStateProps) {
  const [formData, setFormData] = useState<PredictionFormData>(initialFormData);
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialActiveTab);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
  }, []);

  const handlePredictionChange = useCallback(
    (value: string | number) => {
      setFormData((prevFormData) => ({
        ...prevFormData,
        predictionValue: value,
      }));
    },
    [setFormData]
  );

  return {
    formData,
    setFormData,
    activeTab,
    handleTabChange,
    handlePredictionChange,
  };
}
