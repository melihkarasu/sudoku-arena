# 🧩 Sudoku Arena — Akıl & Mantık Oyunu

Mistral AI tasarım sistemine uygun, sıfır dış API bağımlılığıyla çalışan, tohum (seed) tabanlı deterministik ve çevrimdışı Sudoku oyunu.

## ✨ Öne Çıkan Özellikler

1. **Sonsuz ve Deterministik Bulmacalar:**
   - 4 standart zorluk seviyesi (*Kolay*, *Orta*, *Zor*, *Uzman*) veya oyuncunun girdiği herhangi bir ID numarası (örn: `#325`, `#1402`).
   - Mulberry32 tohumlu sözde rastgele sayı motoru: Aynı ID dünyadaki her cihazda istisnasız birebir aynı tahtayı ve tekil çözümü üretir.
2. **Yarım Kalan Oyuna Devam Etme (Auto-Save):**
   - Her hamle, girilen aday notlar, geçen süre ve hatalar tarayıcı hafızasına (`localStorage`) anlık kaydedilir.
   - Sayfa yenilendiğinde veya tekrar açıldığında tek tıkla kalınan yerden devam edilir.
3. **Bulmaca Paylaşımı (Arkadaş Linki):**
   - "Paylaş" butonu ile doğrudan `?id=325` linki panoya kopyalanır. Arkadaşınız linki açtığında aynı bulmaca ile yarışır.
4. **Kronometre & Duraklatmada Blur Katmanı (Anti-Cheat):**
   - Süre duraklatıldığında tahtanın üzerine buzlu (`backdrop-blur-md`) opak bir katman biner ve tahtadaki sayılar tamamen gizlenir.
5. **Objektif Puanlama Motoru:**
   - Zorluk derecesi taban puanı (500 – 3.500 puan).
   - Par süreye göre dinamik hız bonusu.
   - Hatalı hamle (-50) ve ipucu kullanım (-150) cezaları.
6. **Kayıt ve İstatistik Takibi:**
   - Bu oyunun puan dökümü ve ömür boyu toplam XP/puan sayacı.
   - Her bulmaca ID'si için tekil rekor: Aynı ID tekrar oynanırsa sadece en yüksek puanlı ve en hızlı sonuç saklanır.
7. **Liderlik Tablosu & Katı Gizlilik:**
   - Tüm oyuncu isimleri katı gizlilik kuralıyla `m*****u` (ilk ve son harf açık, aradaki 5 karakter yıldızlı) şeklinde şifreli maskelenir.
   - Oyuncunun tablodaki anlık konumu sabit panelde vurgulanır.
8. **Akıllı Not Modu (Pencil Marks):**
   - Hücrelere aday sayıları küçük not olarak yazabilme.
   - Hücreye kesin sayı yerleştiğinde aynı satır, sütun ve 3x3 kutudaki aday notlar otomatik temizlenir.
9. **Günün Sudokusu (Daily Challenge):**
   - Her günün tarihine (YYYYMMDD) özel ortak bulmaca.

## 🚀 Hızlı Başlangıç

1. Depoyu klonlayın veya indirin.
2. `index.html` dosyasını modern bir web tarayıcısında açın.
3. Herhangi bir derleme (build), sunucu veya internet bağlantısı gerektirmez; tamamen çevrimdışı çalışır.

## 📜 Lisans & Atıf

Bu proje [VibeCodedApps](https://github.com/melihkarasu/VibeCodedApps) açık kaynak koleksiyonunun bir parçasıdır.
MIT Lisansı ile lisanslanmıştır.
