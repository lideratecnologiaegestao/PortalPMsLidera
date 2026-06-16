---
id: sip-token
title: Gerar token SIP
---

## Método

#### /sip-token

`POST` https://api.z-api.io/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/sip-token

### Header

|      Key       |            Value            |
| :------------: |     :-----------------:     |
|  Client-Token  | **[TOKEN DE SEGURANÇA DA CONTA](../security/client-token)** |

---

## Conceituação

Método utilizado para gerar as credenciais SIP da instância.

Essas credenciais permitem a integração com serviços de telefonia via protocolo SIP, possibilitando a realização e recebimento de chamadas.
Caso já exista um token SIP ativo, este método realizará a geração de um novo e substituirá o antigo.

---

:::caution Atenção

Para utilizar este recurso, é necessário que a funcionalidade de chamadas esteja **habilitada e contratada** para a sua conta.
Caso contrário, a requisição poderá ser negada.
Este endpoint deve ser utilizado no **backend**, evitando a exposição de credenciais sensíveis.

:::

---

## Request Params

**Método**

`POST` https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN/sip-token

---

## Request Body

Este endpoint não requer body.

---

## Response

### 200

Retorna as credenciais SIP da instância.

| Atributos | Tipo    | Descrição                          |
| :-------- | :-----: | :-------------------------------- |
| host      | string  | Servidor SIP                       |
| user      | string  | Identificador do usuário SIP       |
| token     | string  | Token de autenticação SIP          |
| active    | boolean | Indica se o SIP está ativo         |

**Exemplo**

```json
{
  "host": "sip.z-api.io",
  "user": "3C67AB641C8AA0412F6A2242B4E23AC7",
  "token": "BZ9vKoEsmmrCP6y4t0XYCYBW5rMZrQmJAt6KfERWLvk",
  "active": true
}
```

### 405

Neste caso certifique que esteja enviando corretamente a especificação do método, ou seja, verifique se você enviou o POST conforme especificado no início deste tópico.

### 415

Caso você receba um erro 415, certifique-se de adicionar nos headers da requisição o "Content-Type" adequado, geralmente "application/json".

---