# Parlay API Documentation

Esta documentación describe las nuevas funcionalidades agregadas para soportar parlays en la API.

## Funcionalidades Implementadas

### 1. Similar Markets (Mercados Similares)

Se agregó el campo `similarMarkets` al modelo `Market` que permite almacenar un array de URLs de markets similares.

#### Crear Market con Similar Markets

```typescript
// POST /create-market-group/:marketGroupAddress/markets
{
  "marketData": {
    "marketQuestion": "¿Ganará el equipo A?",
    "optionName": "Sí",
    "startTime": "1640995200",
    "endTime": "1641081600",
    "startingSqrtPriceX96": "79228162514264337593543950336",
    "baseAssetMinPriceTick": "0",
    "baseAssetMaxPriceTick": "100",
    "claimStatementYesOrNumeric": "El equipo A gana",
    "claimStatementNo": "El equipo A no gana",
    "rules": "Reglas del mercado",
    "similarMarkets": [
      "/market/123",
      "/market/456",
      "/market/789"
    ]
  },
  "chainId": "1"
}
```

### 2. Parlay Incompatibility (Incompatibilidad de Parlays)

Se implementó un sistema de matriz de incompatibilidad donde por defecto todos los markets son compatibles, excepto los que se marcan explícitamente como incompatibles.

#### Marcar Markets como Incompatibles

```typescript
// POST /parlay/incompatibility
{
  "marketAId": 1,
  "marketBId": 2,
  "incompatibilityReason": "Same event, different outcomes"
}
```

**Response:**
```json
{
  "id": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "marketAId": 1,
  "marketBId": 2,
  "incompatibilityReason": "Same event, different outcomes"
}
```

#### Remover Incompatibilidad

```typescript
// DELETE /parlay/incompatibility
{
  "marketAId": 1,
  "marketBId": 2
}
```

**Response:**
```json
{
  "message": "Incompatibility removed successfully"
}
```

### 3. Consultas de Compatibilidad

#### Obtener Markets Incompatibles

```typescript
// GET /parlay/incompatible-markets/:marketId
// GET /parlay/incompatible-markets/1
```

**Response:**
```json
[
  {
    "id": 2,
    "marketId": 2,
    "question": "¿Ganará el equipo B?",
    "optionName": "Sí"
  }
]
```

#### Obtener Markets Compatibles

```typescript
// GET /parlay/compatible-markets/:marketId
// GET /parlay/compatible-markets/1
```

**Response:**
```json
[
  {
    "id": 3,
    "marketId": 3,
    "question": "¿Ganará el equipo C?",
    "optionName": "Sí"
  },
  {
    "id": 4,
    "marketId": 4,
    "question": "¿Ganará el equipo D?",
    "optionName": "Sí"
  }
]
```

#### Verificar Compatibilidad entre Dos Markets

```typescript
// GET /parlay/check-compatibility?marketAId=1&marketBId=2
```

**Response:**
```json
{
  "isCompatible": false,
  "incompatibilityReason": "Same event, different outcomes"
}
```

#### Obtener Todas las Incompatibilidades

```typescript
// GET /parlay/all-incompatibilities
```

**Response:**
```json
[
  {
    "id": 1,
    "marketAId": 1,
    "marketBId": 2,
    "incompatibilityReason": "Same event, different outcomes",
    "marketA": {
      "id": 1,
      "marketId": 1,
      "question": "¿Ganará el equipo A?"
    },
    "marketB": {
      "id": 2,
      "marketId": 2,
      "question": "¿Ganará el equipo B?"
    }
  }
]
```

### 4. Cálculo de Probabilidad de Parlay

#### Calcular Probabilidad de Éxito de un Parlay

```typescript
// POST /parlay/get-parlay-chance
{
  "markets": [
    "0x1234567890abcdef/1",
    "0x1234567890abcdef/2",
    "0xfedcba0987654321/1"
  ]
}
```

**Response:**
```json
{
  "parlayChance": 0.7,
  "markets": [
    "0x1234567890abcdef/1",
    "0x1234567890abcdef/2",
    "0xfedcba0987654321/1"
  ],
  "message": "Parlay chance calculated successfully"
}
```

**Notas:**
- `parlayChance` es un valor entre 0 y 1
- El formato de cada market debe ser `marketGroupAddress/marketId`
- Por ahora devuelve siempre 0.7 como valor genérico

## Estructura de Base de Datos

### Modelo Market (Actualizado)

```prisma
model Market {
  // ... campos existentes ...
  similarMarkets String[] @default([])
  
  // Relaciones para parlay incompatibility
  parlayIncompatibilityAsA ParlayIncompatibility[] @relation("ParlayIncompatibilityA")
  parlayIncompatibilityAsB ParlayIncompatibility[] @relation("ParlayIncompatibilityB")
}
```

### Modelo ParlayIncompatibility (Nuevo)

```prisma
model ParlayIncompatibility {
  id                    Int      @id @default(autoincrement())
  createdAt             DateTime @default(now())
  
  // Referencias a los dos markets incompatibles
  marketAId             Int
  marketBId             Int
  
  // Razón por la cual son incompatibles (opcional)
  incompatibilityReason String?  @db.Text
  
  // Relaciones
  marketA               Market   @relation("ParlayIncompatibilityA", fields: [marketAId], references: [id])
  marketB               Market   @relation("ParlayIncompatibilityB", fields: [marketBId], references: [id])
  
  // Índices para optimizar consultas
  @@unique([marketAId, marketBId])
  @@index([marketAId])
  @@index([marketBId])
}
```

## Ejemplos de Uso

### Escenario 1: Crear Markets Similares

```typescript
// Crear market principal
const mainMarket = await fetch('/create-market-group/0x123/markets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketData: {
      marketQuestion: "¿Ganará el equipo A?",
      // ... otros campos ...
      similarMarkets: ["/market/456", "/market/789"]
    },
    chainId: "1"
  })
});
```

### Escenario 2: Configurar Incompatibilidades

```typescript
// Marcar markets como incompatibles
await fetch('/parlay/incompatibility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    marketAId: 1,
    marketBId: 2,
    incompatibilityReason: "Same event, different outcomes"
  })
});

// Verificar compatibilidad
const compatibility = await fetch('/parlay/check-compatibility?marketAId=1&marketBId=2');
const result = await compatibility.json();
console.log(result.isCompatible); // false
```

### Escenario 3: Obtener Markets para Parlay

```typescript
// Obtener markets compatibles con market 1
const compatibleMarkets = await fetch('/parlay/compatible-markets/1');
const markets = await compatibleMarkets.json();

// Filtrar markets que no están en similarMarkets del market 1
const market1 = await fetch('/market/1');
const market1Data = await market1.json();
const similarMarketIds = market1Data.similarMarkets.map(url => {
  const match = url.match(/\/market\/(\d+)/);
  return match ? parseInt(match[1]) : null;
}).filter(id => id !== null);

const parlayCandidates = markets.filter(market => 
  !similarMarketIds.includes(market.id)
);

// Calcular probabilidad de parlay
const parlayChance = await fetch('/parlay/get-parlay-chance', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    markets: [
      '0x1234567890abcdef/1',
      '0x1234567890abcdef/2'
    ]
  })
});
const chanceResult = await parlayChance.json();
console.log(`Parlay chance: ${chanceResult.parlayChance}`); // 0.7

## Notas Importantes

1. **Por defecto, todos los markets son compatibles** - Solo se almacenan las incompatibilidades explícitas
2. **Las incompatibilidades son bidireccionales** - Si A es incompatible con B, B es incompatible con A
3. **El campo similarMarkets es opcional** - Si no se proporciona, se usa un array vacío
4. **Las URLs en similarMarkets deben seguir el formato** `/market/{id}`
5. **Las validaciones incluyen**:
   - Verificar que ambos markets existan
   - Verificar que no se marque un market como incompatible consigo mismo
   - Validar que se proporcionen todos los campos requeridos

## Próximos Pasos

- Implementar GraphQL resolvers para consultas más flexibles
- Agregar endpoints para bulk operations
- Implementar cache para mejorar performance
- Agregar validaciones adicionales según necesidades específicas 