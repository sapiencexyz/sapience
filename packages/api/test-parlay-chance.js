// Test script for the get-parlay-chance endpoint
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

async function testParlayChance() {
  console.log('🧪 Testing get-parlay-chance endpoint...\n');

  const testCases = [
    {
      name: 'Case 1: Single market',
      markets: ['0x1234567890abcdef/1'],
      marketPredictions: [true]
    },
    {
      name: 'Case 2: Two markets from same group',
      markets: ['0x1234567890abcdef/1', '0x1234567890abcdef/2'],
      marketPredictions: [true, false]
    },
    {
      name: 'Case 3: Three markets from different groups',
      markets: [
        '0x1234567890abcdef/1',
        '0xfedcba0987654321/1',
        '0xabcdef1234567890/2'
      ],
      marketPredictions: [true, false, true]
    }
  ];

  for (const testCase of testCases) {
    console.log(`📋 ${testCase.name}`);
    console.log(`📤 Sending:`, { markets: testCase.markets, marketPredictions: testCase.marketPredictions });
    
    try {
      const response = await fetch(`${API_BASE_URL}/parlay/get-parlay-chance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          markets: testCase.markets,
          marketPredictions: testCase.marketPredictions
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ Successful response:`);
        console.log(`   - Parlay Chance: ${data.parlayChance}`);
        console.log(`   - Markets: ${data.markets.join(', ')}`);
        console.log(`   - Message: ${data.message}`);
      } else {
        console.log(`❌ Error ${response.status}:`, data.message);
      }
    } catch (error) {
      console.log(`❌ Network error:`, error.message);
    }
    
    console.log('');
  }

  // Test error cases
  console.log('🚨 Testing error cases...\n');

  const errorCases = [
    {
      name: 'Error: Empty array',
      payload: { markets: [], marketPredictions: [] }
    },
    {
      name: 'Error: Invalid format',
      payload: { markets: ['invalid-format'], marketPredictions: [true] }
    },
    {
      name: 'Error: No markets',
      payload: {}
    },
    {
      name: 'Error: Missing market predictions',
      payload: { markets: ['0x1234567890abcdef/1'] }
    },
    {
      name: 'Error: Different lengths',
      payload: { markets: ['0x1234567890abcdef/1', '0x1234567890abcdef/2'], marketPredictions: [true] }
    },
    {
      name: 'Error: Invalid prediction type',
      payload: { markets: ['0x1234567890abcdef/1'], marketPredictions: ['not-a-boolean'] }
    }
  ];

  for (const errorCase of errorCases) {
    console.log(`📋 ${errorCase.name}`);
    console.log(`📤 Sending:`, errorCase.payload);
    
    try {
      const response = await fetch(`${API_BASE_URL}/parlay/get-parlay-chance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorCase.payload)
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.log(`✅ Error esperado ${response.status}:`, data.message);
      } else {
        console.log(`❌ No se esperaba éxito:`, data);
      }
    } catch (error) {
      console.log(`❌ Error de red:`, error.message);
    }
    
    console.log('');
  }

  console.log('✅ Pruebas completadas!');
}

// Ejecutar las pruebas
testParlayChance().catch(console.error); 