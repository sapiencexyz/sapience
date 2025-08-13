// Script de prueba para el endpoint get-parlay-chance
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';

async function testParlayChance() {
  console.log('🧪 Probando endpoint get-parlay-chance...\n');

  const testCases = [
    {
      name: 'Caso 1: Un solo market',
      markets: ['0x1234567890abcdef/1']
    },
    {
      name: 'Caso 2: Dos markets del mismo grupo',
      markets: ['0x1234567890abcdef/1', '0x1234567890abcdef/2']
    },
    {
      name: 'Caso 3: Tres markets de diferentes grupos',
      markets: [
        '0x1234567890abcdef/1',
        '0xfedcba0987654321/1',
        '0xabcdef1234567890/2'
      ]
    }
  ];

  for (const testCase of testCases) {
    console.log(`📋 ${testCase.name}`);
    console.log(`📤 Enviando:`, testCase.markets);
    
    try {
      const response = await fetch(`${API_BASE_URL}/parlay/get-parlay-chance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          markets: testCase.markets
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log(`✅ Respuesta exitosa:`);
        console.log(`   - Parlay Chance: ${data.parlayChance}`);
        console.log(`   - Markets: ${data.markets.join(', ')}`);
        console.log(`   - Mensaje: ${data.message}`);
      } else {
        console.log(`❌ Error ${response.status}:`, data.message);
      }
    } catch (error) {
      console.log(`❌ Error de red:`, error.message);
    }
    
    console.log('');
  }

  // Probar casos de error
  console.log('🚨 Probando casos de error...\n');

  const errorCases = [
    {
      name: 'Error: Array vacío',
      payload: { markets: [] }
    },
    {
      name: 'Error: Formato inválido',
      payload: { markets: ['invalid-format'] }
    },
    {
      name: 'Error: Sin markets',
      payload: {}
    }
  ];

  for (const errorCase of errorCases) {
    console.log(`📋 ${errorCase.name}`);
    console.log(`📤 Enviando:`, errorCase.payload);
    
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