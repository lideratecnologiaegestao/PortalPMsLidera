/**
 * Validação server-side dos dados de um envio de formulário.
 * NUNCA confia no body do cliente — valida tudo pelo schema do formulário.
 */
import { CampoSchema } from './formularios.types';

// CPF: valida dígitos verificadores
function validarCpf(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, '');
  if (nums.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(nums)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(nums[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(nums[10]);
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validarTelefone(tel: string): boolean {
  const digits = tel.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

/**
 * Compila e testa uma regex do usuário de forma segura.
 * Retorna false se a regex for inválida ou lançar erro.
 */
function testarRegexSegura(pattern: string, valor: string): boolean {
  try {
    const re = new RegExp(pattern);
    return re.test(valor);
  } catch {
    return false; // regex inválida → ignora
  }
}

export interface ErroValidacao {
  campo: string;
  mensagem: string;
}

/**
 * Valida os dados do envio contra o schema do formulário.
 * Retorna lista de erros (vazia = ok).
 */
export function validarEnvio(
  schema: CampoSchema[],
  dados: Record<string, unknown>,
): ErroValidacao[] {
  const erros: ErroValidacao[] = [];

  for (const campo of schema) {
    // Campos estáticos (secao, paragrafo) não têm entrada
    if (campo.tipo === 'secao' || campo.tipo === 'paragrafo') continue;

    const valor = dados[campo.nome];
    const vazio =
      valor === undefined ||
      valor === null ||
      (typeof valor === 'string' && valor.trim() === '') ||
      (Array.isArray(valor) && valor.length === 0);

    // Obrigatório
    if (campo.obrigatorio && vazio) {
      erros.push({
        campo: campo.nome,
        mensagem: campo.validacao?.mensagem ?? `O campo "${campo.label}" é obrigatório.`,
      });
      continue; // não valida mais este campo se estiver vazio
    }

    if (vazio) continue; // opcional e vazio → ok

    const valorStr = Array.isArray(valor)
      ? (valor as string[]).join(', ')
      : String(valor);

    // Validações de formato por tipo de campo
    switch (campo.tipo) {
      case 'email': {
        if (!validarEmail(valorStr)) {
          erros.push({ campo: campo.nome, mensagem: `"${campo.label}": e-mail inválido.` });
        }
        break;
      }
      case 'telefone': {
        if (!validarTelefone(valorStr)) {
          erros.push({ campo: campo.nome, mensagem: `"${campo.label}": telefone inválido.` });
        }
        break;
      }
      case 'cpf': {
        if (!validarCpf(valorStr)) {
          erros.push({ campo: campo.nome, mensagem: `"${campo.label}": CPF inválido.` });
        }
        break;
      }
      case 'numero': {
        if (isNaN(Number(valorStr))) {
          erros.push({ campo: campo.nome, mensagem: `"${campo.label}": deve ser um número.` });
        }
        break;
      }
    }

    // Validações de validacao{}
    const v = campo.validacao;
    if (v) {
      // formato explícito (pode vir em campos texto com validacao.formato)
      if (v.formato === 'email' && !validarEmail(valorStr)) {
        erros.push({ campo: campo.nome, mensagem: v.mensagem ?? `"${campo.label}": e-mail inválido.` });
      }
      if (v.formato === 'telefone' && !validarTelefone(valorStr)) {
        erros.push({ campo: campo.nome, mensagem: v.mensagem ?? `"${campo.label}": telefone inválido.` });
      }
      if (v.formato === 'cpf' && !validarCpf(valorStr)) {
        erros.push({ campo: campo.nome, mensagem: v.mensagem ?? `"${campo.label}": CPF inválido.` });
      }
      if (v.formato === 'numero' && isNaN(Number(valorStr))) {
        erros.push({ campo: campo.nome, mensagem: v.mensagem ?? `"${campo.label}": número inválido.` });
      }

      if (v.minLength != null && valorStr.length < v.minLength) {
        erros.push({
          campo: campo.nome,
          mensagem: v.mensagem ?? `"${campo.label}": mínimo de ${v.minLength} caracteres.`,
        });
      }
      if (v.maxLength != null && valorStr.length > v.maxLength) {
        erros.push({
          campo: campo.nome,
          mensagem: v.mensagem ?? `"${campo.label}": máximo de ${v.maxLength} caracteres.`,
        });
      }
      if (v.regex) {
        if (!testarRegexSegura(v.regex, valorStr)) {
          erros.push({ campo: campo.nome, mensagem: v.mensagem ?? `"${campo.label}": formato inválido.` });
        }
      }
    }

    // Select/radio: valor deve estar nas opcoes
    if ((campo.tipo === 'select' || campo.tipo === 'radio') && campo.opcoes?.length) {
      const valoresValidos = campo.opcoes.map((o) => o.valor);
      if (!valoresValidos.includes(valorStr)) {
        erros.push({ campo: campo.nome, mensagem: `"${campo.label}": opção inválida.` });
      }
    }

    // Checkbox: cada valor deve estar nas opcoes
    if (campo.tipo === 'checkbox' && campo.opcoes?.length && Array.isArray(valor)) {
      const valoresValidos = campo.opcoes.map((o) => o.valor);
      for (const v of valor as string[]) {
        if (!valoresValidos.includes(v)) {
          erros.push({ campo: campo.nome, mensagem: `"${campo.label}": opção inválida: ${v}.` });
        }
      }
    }
  }

  return erros;
}
