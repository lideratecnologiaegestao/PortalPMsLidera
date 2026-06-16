---
id: sip-info
title: Obter informações SIP
---

## Método

#### /sip-info

`GET` https://api.z-api.io/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/sip-info

### Header

|      Key       |            Value            |
| :------------: |     :-----------------:     |
|  Client-Token  | **[TOKEN DE SEGURANÇA DA CONTA](../security/client-token)** |

---

## Conceituação

Método utilizado para consultar as informações SIP da instância.

Este endpoint permite verificar se já existe um token SIP configurado e se o serviço está ativo.

---

:::caution Atenção

Para utilizar este recurso, é necessário que a funcionalidade de chamadas esteja **habilitada e contratada** para a sua conta.
Este endpoint deve ser utilizado no **backend**, evitando a exposição de credenciais sensíveis.

:::

---

## Request Params

**Método**

`GET` https://api.z-api.io/instances/SUA_INSTANCIA/token/SEU_TOKEN/sip-info

---

## Request Body

Este endpoint não requer body.

---

## Response

### 200

Retorna as informações SIP da instância.

#### Quando já existe um token configurado:

| Atributos | Tipo    | Descrição                          |
| :-------- | :-----: | :-------------------------------- |
| host      | string  | Servidor SIP                       |
| user      | string  | Identificador do usuário SIP       |
| token     | string  | Token mascarado                    |
| active    | boolean | Indica se o SIP está ativo         |

**Exemplo**

```json
{
  "host": "sip.z-api.io",
  "user": "3C67AB641C8AA0412F6A2242B4E23AC7",
  "token": "BZ9***",
  "active": true
}
```

#### Quando não existe token configurado:

| Atributos | Tipo    | Descrição                       |
| :-------- | :-----: | :----------------------------- |
| host      | string  | Servidor SIP                   |
| user      | string  | Identificador do usuário SIP   |
| active    | boolean | Indica que o SIP não está ativo|

**Exemplo**

```json
{
  "host": "sip.z-api.io",
  "user": "3C67AB641C8AA0412F6A2242B4E23AC7",
  "active": false
}
```

### 405

Neste caso certifique que esteja enviando corretamente a especificação do método, ou seja, verifique se você enviou o GET conforme especificado no início deste tópico.

### 415

Caso você receba um erro 415, certifique-se de adicionar nos headers da requisição o "Content-Type" adequado, geralmente "application/json".

---


