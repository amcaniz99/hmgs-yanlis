import { getStore } from '@netlify/blobs';

// Kullanıcı adına göre kayıt eşitleme.
// GET  ?kullanici=X                 -> kullanıcının meta listesi
// GET  ?kullanici=X&foto=UID-0      -> tek fotoğraf (dataURL metni)
// PUT  ?kullanici=X&foto=UID-0      -> fotoğraf yükle (gövde: dataURL metni)
// POST ?kullanici=X                 -> gelen meta listesi sunucudakiyle birleştirilir
//                                      (uid bazında, guncelleme'si yeni olan kazanır), sonuç döner

const IZINLI_KULLANICILAR = new Set(['buse', 'efe', 'affan']);
const KULLANICI_DESENI = /^[a-z0-9çğıöşüâ._-]{2,30}$/;
const FOTO_DESENI = /^[A-Za-z0-9_-]{1,80}$/;

export default async (req) => {
  const url = new URL(req.url);
  const kullanici = (url.searchParams.get('kullanici') || '').trim().toLocaleLowerCase('tr');
  if (!KULLANICI_DESENI.test(kullanici) || !IZINLI_KULLANICILAR.has(kullanici)) {
    return Response.json({ hata: 'geçersiz kullanıcı adı' }, { status: 403 });
  }
  const store = getStore('hmgs');
  const foto = url.searchParams.get('foto') || '';

  if (foto) {
    if (!FOTO_DESENI.test(foto)) return Response.json({ hata: 'geçersiz foto anahtarı' }, { status: 400 });
    const anahtar = 'foto/' + kullanici + '/' + foto;
    if (req.method === 'PUT') {
      const govde = await req.text();
      if (!govde || govde.length > 4 * 1024 * 1024) {
        return Response.json({ hata: 'foto boş ya da çok büyük' }, { status: 400 });
      }
      await store.set(anahtar, govde);
      return Response.json({ tamam: true });
    }
    if (req.method === 'GET') {
      const veri = await store.get(anahtar);
      return Response.json({ veri: veri || null });
    }
    return new Response('yöntem desteklenmiyor', { status: 405 });
  }

  const metaAnahtar = 'meta/' + kullanici;

  if (req.method === 'GET') {
    const metin = await store.get(metaAnahtar);
    return Response.json(metin ? JSON.parse(metin) : { kayitlar: [] });
  }

  if (req.method === 'POST') {
    let gelen;
    try { gelen = await req.json(); } catch (e) { return Response.json({ hata: 'geçersiz JSON' }, { status: 400 }); }
    if (!gelen || !Array.isArray(gelen.kayitlar)) return Response.json({ hata: 'kayitlar dizisi gerekli' }, { status: 400 });

    const metin = await store.get(metaAnahtar);
    const eski = metin ? JSON.parse(metin) : { kayitlar: [] };
    const birlesim = new Map();
    for (const k of eski.kayitlar) {
      if (k && k.uid) birlesim.set(k.uid, k);
    }
    for (const k of gelen.kayitlar) {
      if (!k || !k.uid) continue;
      const mevcut = birlesim.get(k.uid);
      if (!mevcut || (k.guncelleme || '') > (mevcut.guncelleme || '')) birlesim.set(k.uid, k);
    }
    // hesap ayarları (örn. AI anahtarı): sadece dolu gelen alanlar üzerine yazar
    const ayarlar = Object.assign({}, eski.ayarlar || {});
    if (gelen.ayarlar && typeof gelen.ayarlar === 'object') {
      for (const [alan, deger] of Object.entries(gelen.ayarlar)) {
        if (deger) ayarlar[alan] = deger;
      }
    }
    const sonuc = { kayitlar: [...birlesim.values()], ayarlar };
    await store.set(metaAnahtar, JSON.stringify(sonuc));
    return Response.json(sonuc);
  }

  return new Response('yöntem desteklenmiyor', { status: 405 });
};

export const config = { path: '/api/senkron' };
