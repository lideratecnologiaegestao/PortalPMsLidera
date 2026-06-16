import { toCsv } from './csv.util';

describe('toCsv (dados abertos)', () => {
  it('gera cabeçalho + linhas separadas por ;', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
    expect(csv).toBe('a;b\n1;x\n2;y\n');
  });

  it('escapa aspas, vírgulas e quebras de linha', () => {
    const csv = toCsv([{ nome: 'Silva, João', obs: 'linha1\nlinha2' }]);
    expect(csv).toContain('"Silva, João"');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it('neutraliza CSV injection (prefixo de fórmula)', () => {
    const csv = toCsv([{ campo: '=SOMA(A1:A2)' }]);
    // recebe apóstrofo na frente e, por conter aspas? não — só vira '=...
    expect(csv).toContain("'=SOMA(A1:A2)");
  });

  it('campo vazio para null/undefined', () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }]);
    expect(csv).toBe('a;b;c\n;;0\n');
  });

  it('lista vazia retorna só o cabeçalho informado', () => {
    expect(toCsv([], ['x', 'y'])).toBe('x;y\n');
  });
});
