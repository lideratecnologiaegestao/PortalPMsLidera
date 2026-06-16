import React from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleProp, Text, TextInput,
  TextStyle, View, ViewStyle,
} from 'react-native';
import { useTheme } from '../lib/theme';
import { Icone, NomeIcone } from './icone';

/** Componentes base do app, temados (multi-tenant claro/escuro). */

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const base: ViewStyle = { flex: 1, backgroundColor: c.bg };
  if (!scroll) return <View style={[base, { padding: 16 }, style]}>{children}</View>;
  return (
    <ScrollView style={base} contentContainerStyle={[{ padding: 16, gap: 14 }, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Titulo({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const { c } = useTheme();
  return <Text style={[{ fontSize: 20, fontWeight: '800', color: c.fg }, style]}>{children}</Text>;
}
export function Subtitulo({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ fontSize: 13, color: c.muted, lineHeight: 19 }}>{children}</Text>;
}
export function SecaoTitulo({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ fontSize: 16, fontWeight: '700', color: c.fg, marginTop: 4 }}>{children}</Text>;
}

export function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const s: ViewStyle = { backgroundColor: c.card, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
  return <View style={[s, style]}>{children}</View>;
}

export function Btn({ titulo, onPress, variante = 'primario', carregando, disabled, icone, style }: {
  titulo: string; onPress?: () => void; variante?: 'primario' | 'contorno' | 'sutil';
  carregando?: boolean; disabled?: boolean; icone?: NomeIcone; style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = variante === 'primario' ? c.primary : variante === 'sutil' ? c.muted + '22' : 'transparent';
  const fg = variante === 'primario' ? c.primaryFg : c.primary;
  const borda = variante === 'contorno' ? c.primary : 'transparent';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || carregando}
      accessibilityRole="button"
      style={({ pressed }) => [
        { backgroundColor: bg, borderColor: borda, borderWidth: variante === 'contorno' ? 1.5 : 0,
          paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
        (disabled || carregando) && { opacity: 0.55 }, pressed && { opacity: 0.85 }, style,
      ]}
    >
      {carregando && <ActivityIndicator color={fg} size="small" />}
      {!carregando && icone && <Icone nome={icone} tamanho={18} cor={fg} />}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{titulo}</Text>
    </Pressable>
  );
}

export function Campo({ label, valor, onChange, placeholder, multiline, keyboardType, autoCapitalize, secure }: {
  label?: string; valor: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad'; autoCapitalize?: 'none' | 'sentences'; secure?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={{ color: c.fg, fontWeight: '600', fontSize: 14 }}>{label}</Text>}
      <TextInput
        value={valor}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secure}
        style={{
          backgroundColor: c.card, color: c.fg, borderWidth: 1, borderColor: c.border,
          borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15,
          minHeight: multiline ? 96 : undefined, textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function Pill({ texto, cor }: { texto: string; cor?: string }) {
  const { c } = useTheme();
  const base = cor ?? c.primary;
  return (
    <View style={{ backgroundColor: base + '22', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' }}>
      <Text style={{ color: base, fontSize: 12, fontWeight: '700' }}>{texto}</Text>
    </View>
  );
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'info'; children: React.ReactNode }) {
  const { c } = useTheme();
  const cor = tipo === 'erro' ? c.danger : tipo === 'ok' ? c.success : c.secondary;
  return (
    <View style={{ backgroundColor: cor + '18', borderColor: cor + '55', borderWidth: 1, borderRadius: 10, padding: 11 }}>
      <Text style={{ color: cor, fontSize: 14 }}>{children}</Text>
    </View>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <Text style={{ color: c.muted, textAlign: 'center', paddingVertical: 24 }}>{children}</Text>;
}
