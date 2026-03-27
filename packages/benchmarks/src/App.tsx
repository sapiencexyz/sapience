import { useState, useCallback } from 'react';
import { GqlBenchmark } from './components/GqlBenchmark';
import { RelayerBenchmark } from './components/RelayerBenchmark';
import { extractConditions } from './lib/picks';
import { ENV_CONFIGS, type Environment, type EnvConfig } from './lib/constants';

interface ConditionInfo {
  id: string;
  resolver: string;
}

export function App() {
  const [env, setEnv] = useState<Environment>('staging');
  const [conditions, setConditions] = useState<ConditionInfo[]>([]);

  const config: EnvConfig = ENV_CONFIGS[env];

  const handleQuestionsReceived = useCallback((questions: unknown[]) => {
    const extracted = extractConditions(questions as Parameters<typeof extractConditions>[0]);
    if (extracted.length > 0) {
      setConditions(extracted);
    }
  }, []);

  const handleEnvChange = (newEnv: Environment) => {
    setEnv(newEnv);
    setConditions([]); // reset conditions when switching
  };

  return (
    <div className="app">
      <header>
        <h1>Sapience Benchmarks</h1>
        <div className="env-switcher">
          <button
            className={`env-btn ${env === 'staging' ? 'env-active' : ''}`}
            onClick={() => handleEnvChange('staging')}
          >
            Staging
          </button>
          <button
            className={`env-btn ${env === 'production' ? 'env-active' : ''}`}
            onClick={() => handleEnvChange('production')}
          >
            Production
          </button>
        </div>
      </header>
      <main className="columns">
        <GqlBenchmark config={config} onQuestionsReceived={handleQuestionsReceived} />
        <RelayerBenchmark config={config} conditions={conditions} />
      </main>
    </div>
  );
}
