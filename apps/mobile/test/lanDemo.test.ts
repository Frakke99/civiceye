import { describe, expect, it } from 'vitest';
import { isLokaalAdres, volgPagina } from '../src/config/lanDemo';

describe('isLokaalAdres', () => {
  it('herkent loopback en de drie privéreeksen', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.11.99', '172.16.0.1', '172.28.96.1', '172.31.255.1']) {
      expect(isLokaalAdres(host), host).toBe(true);
    }
  });

  it('ziet publieke hosts niet als lokaal', () => {
    for (const host of ['frakke99.github.io', 'abc.supabase.co', '8.8.8.8', '172.32.0.1', '171.28.96.1']) {
      expect(isLokaalAdres(host), host).toBe(false);
    }
  });
});

describe('volgPagina', () => {
  it('laat een ingebakken loopback de pagina volgen (telefoon-valkuil)', () => {
    expect(volgPagina('http://127.0.0.1:8811', '192.168.11.99')).toBe('http://192.168.11.99:8811');
  });

  it('corrigeert een ingebakken virtueel adapter-adres naar het pagina-adres', () => {
    // WSL/Hyper-V enumereert op Windows vóór de echte wifi; de tester opent de
    // pagina via het hotspot-adres en de API moet dan mee.
    expect(volgPagina('http://172.28.96.1:8811', '172.20.10.4')).toBe('http://172.20.10.4:8811');
  });

  it('blijft van echte omgevingen af', () => {
    expect(volgPagina('https://abc.supabase.co', 'frakke99.github.io')).toBe(
      'https://abc.supabase.co',
    );
    // Zelfs wanneer de pagina lokaal draait: een publieke API is geen demo-mock.
    expect(volgPagina('https://abc.supabase.co', '192.168.11.99')).toBe('https://abc.supabase.co');
  });

  it('doet niets wanneer pagina en API al op dezelfde host zitten', () => {
    expect(volgPagina('http://192.168.11.99:8811', '192.168.11.99')).toBe(
      'http://192.168.11.99:8811',
    );
  });

  it('overleeft een kapotte URL en een ontbrekende paginahost', () => {
    expect(volgPagina('geen-url', '192.168.11.99')).toBe('geen-url');
    expect(volgPagina('http://127.0.0.1:8811', undefined)).toBe('http://127.0.0.1:8811');
  });
});
