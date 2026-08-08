/* ══════════════════════════════════════════════════════════════════════════
   ROTA SMI — SÖZLEŞME METİNLERİ (ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME)

   Kaynak: saha/sozlesme-sablonlari/*.docx (firmanın Rev1 metinleri).
   Metin AYNEN alınmıştır; yalnız yapı (başlık / paragraf / tablo / künye satırı)
   çıkarılmış, imza blokları sekmeyle dizilmiş metin yerine iki sütuna çevrilmiştir.

   HUKUKİ METİN — düzeltme gerekirse ÖNCE .docx güncellenir, sonra bu dosya
   yeniden üretilir. Buradan elle düzeltilen bir cümle, bir dahaki üretimde kaybolur.

   Blok tipleri: h1 başlık · h2 madde · h3 alt başlık · p paragraf · li bent
                 kv "Anahtar : Değer" künye satırı · tbl tablo · imza · bos boşluk
   {alan} yer tutucuları sozlesmeVeri() ile doldurulur; boş kalanlar noktalı
   çizgi olarak basılır (elle doldurulabilsin).
   ══════════════════════════════════════════════════════════════════════════ */
window.SOZ_METIN = {
 "bayiSozlesme": {
  "ad": "Bayilik Sözleşmesi",
  "bloklar": [
   {
    "t": "h1",
    "x": "BAYİLİK SÖZLEŞMESİ"
   },
   {
    "t": "h2",
    "x": "Madde 1- Taraflar;"
   },
   {
    "t": "p",
    "x": "Bir yanda Rota SMI Tarım ve Hayvancılık Sanayi Ticaret A.Ş. (bundan sonra “ŞİRKET” olarak anılacaktır) ile diğer yanda aşağıda bilgileri yazılı […………………..] (bundan sonra “Bayi” olarak anılacaktır) aşağıdaki koşullarla aralarında bir bayilik anlaşması yapmayı kabul etmişlerdir."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "ŞİRKET"
   },
   {
    "t": "kv",
    "k": "Unvanı",
    "v": "Rota SMI Tarım ve Hayvancılık San. Tic. A.Ş."
   },
   {
    "t": "kv",
    "k": "Adresi",
    "v": "Gümüşçeşme Mah. 8175. Sk. Ticaret Borsası Sitesi C Blok No:6/19B Altıeylül/BALIKESİR"
   },
   {
    "t": "kv",
    "k": "Vergi Dairesi / No",
    "v": "Kurtdereli / 735 207 6619"
   },
   {
    "t": "kv",
    "k": "Yetkili",
    "v": "İbrahim ÜRENLİOĞLU"
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "BAYİ"
   },
   {
    "t": "kv",
    "k": "Unvanı / Adı Soyadı",
    "v": "{unvan}"
   },
   {
    "t": "kv",
    "k": "Adresi",
    "v": "{adres}"
   },
   {
    "t": "kv",
    "k": "Vergi Dairesi / No",
    "v": "{vergiDaireNo}"
   },
   {
    "t": "kv",
    "k": "Ticaret Sicil No",
    "v": "{ticaretSicil}"
   },
   {
    "t": "kv",
    "k": "Yetkili Kişi",
    "v": "{yetkili}"
   },
   {
    "t": "kv",
    "k": "Telefon / GSM",
    "v": "{telefon}"
   },
   {
    "t": "kv",
    "k": "E-posta",
    "v": "{eposta}"
   },
   {
    "t": "h2",
    "x": "Madde 2- Sözleşmenin Konusu;"
   },
   {
    "t": "p",
    "x": "Sözleşmenin konusu, ŞİRKET tarafından üretilen TMR (Total Mixed Ration / Toplam Karışım Rasyon) yem ürünleri başta olmak üzere, ŞİRKET’in markası altında üretip piyasaya sunduğu tüm yem, yem katkı maddeleri ve tarımsal ürünlerin (“Ürünler”) bayilik kapsamında satışının yapılmasıdır."
   },
   {
    "t": "h2",
    "x": "Madde 3- Bölge;"
   },
   {
    "t": "p",
    "x": "3.1. ŞİRKET sözleşme konusu ürünleri bölgesinde yeniden satış amacıyla Bayi’ye verecektir. Bölgenin sınırları aşağıdaki şekilde beraberce tespit edilmiştir."
   },
   {
    "t": "p",
    "x": "3.2. ŞİRKET, üçüncü maddede belirtilen bölgede kurumsal toplu tüketim yerleri (otel, hastane, okul, kışla, cezaevi gibi kamu ve özel kurumsal alıcılar ile zincir marketler) hariç olmak üzere Bayi’ye rakip olacak şekilde doğrudan satış yapmayacaktır."
   },
   {
    "t": "p",
    "x": "3.3. Bayi 3.1. maddede belirtilen ve kendisine tahsis edilen bölge içinde sözleşme konusu Ürünlerin satışını arttırmak için tüm gayret ve çabasını sözleşme konusu Ürünlerin satışına yoğunlaştıracaktır."
   },
   {
    "t": "p",
    "x": "Bayi tüm aktif satış çabasını kendi bölgesine yoğunlaştırmalıdır. Bu nedenle başka bayilerin bölgelerinde de aktif faaliyet göstererek gücünün bölünmesine yol açmamalıdır. Bu amaca ulaşılabilmesi için Bayiinin kendisine ayrılan ve 3.1. maddede tanımlanan bölge dışında alt bayiler ataması, şube açması, dağıtım deposu kurması vb. davranışlarla aktif satış politikaları izlemesi yasaklanmıştır."
   },
   {
    "t": "p",
    "x": "3.4. Bayi, sözleşme konusu ürünleri sadece ŞİRKET’ten alacaktır."
   },
   {
    "t": "bos"
   },
   {
    "t": "h2",
    "x": "Madde 4- Satış Hedefleri;"
   },
   {
    "t": "p",
    "x": "Bayi, sözleşme konusu Ürünlerin tüm çeşitlerinden satın alarak dağıtmak ve taraflarca tespit edilecek hedeflere ulaşabilmek için belirli miktarlarda satmak zorundadır. Bu hedeflerin her yıl biraz daha arttırılması tarafların ortak dileğidir. Bu nedenle Bayi bu hedeflere ulaşmak için çaba sarf edecektir. Bir önceki satış hedefini aşan bayilerin satış hedefleri, bir önceki yıl fiilen gerçekleştirdikleri miktarlar dikkate alınarak arttırılır."
   },
   {
    "t": "h2",
    "x": "Madde 5- Alt Bayilik;"
   },
   {
    "t": "p",
    "x": "Bayi, kendisine ayrılan bölge içinde alt bayilikler atayabilir; bayi bir dağıtım sistemi oluşturmak zorundadır. Şu kadar ki atayacağı alt bayiliklerle ilgili olarak ŞİRKET’in yazılı onayını almak zorundadır. Bununla birlikte alt bayilere karşı ŞİRKET’in herhangi bir sorumluluğu bulunmamaktadır."
   },
   {
    "t": "p",
    "x": "Alt bayiinin ŞİRKET tarafından oluşturulan dağıtım ağına, Ürünlerinin imajına zarar verebilecek davranışlarının ya da bu sözleşmeye veya bayi ile alt bayi arasındaki sözleşmeye aykırı davranışlarının tespit edilmesi halinde, ŞİRKET’in diğer hakları saklı kalmak üzere, ŞİRKET bayiden bu alt bayiliğe derhal son vermesini isteyebilir."
   },
   {
    "t": "p",
    "x": "Bayiinin haksız yere bu isteği yerine getirmemesi halinde ŞİRKET bu sözleşmeyi feshedebilir."
   },
   {
    "t": "h2",
    "x": "Madde 6- Bölgenin Daraltılması;"
   },
   {
    "t": "p",
    "x": "Bayiinin tespit edilmiş olan hedeflere ulaşmakta başarısız olması gibi haklı sebeplerin varlığı halinde ŞİRKET sözleşmeyi feshedebileceği gibi bayiinin kabul etmesi halinde sözleşmeyi feshetmek yerine bayiinin bölgesini daraltabilir."
   },
   {
    "t": "h2",
    "x": "Madde 7- Rekabet Yasağı;"
   },
   {
    "t": "p",
    "x": "Bayi, doğrudan veya dolaylı olarak sözleşme konusu Ürünlere rakip olabilecek ürünlerin üretimi ile uğraşamayacağı gibi bu gibi malların alım satımını veya dağıtımını yapamaz. Sözleşme konusu Ürünlere rakip olan ürünlerin reklamını yapamaz veya katkıda bulunamaz."
   },
   {
    "t": "p",
    "x": "Bayiinin tüzel kişi olması halinde rekabet yasağı ortakları için de geçerlidir."
   },
   {
    "t": "p",
    "x": "Rekabet yasağı, sözleşmenin herhangi bir nedenle sona ermesinden itibaren Bayi’nin faaliyet gösterdiği bölge ile sınırlı olmak üzere 1 (bir) yıl süreyle devam eder."
   },
   {
    "t": "h2",
    "x": "Madde 8- Reklamlar;"
   },
   {
    "t": "p",
    "x": "Bayi, kendi bölgesinde satışı arttırmak amacıyla reklam ve diğer satış arttırma faaliyetlerinde bulunmak zorundadır. Bayinin reklam amacıyla kullanacağı tabela, afiş, pano, ışıklı pano gibi reklam vasıtaları ŞİRKET tarafından tespit edilen standartlara aykırı olamaz. ŞİRKET reklam vasıtalarının kendi standartlarına uygun olup olmadığını denetleme hakkına sahiptir. Bunların yapılmasında Bayi talep ederse ŞİRKET kendilerine yardımcı olacak, ancak giderler Bayi tarafından ödenecektir."
   },
   {
    "t": "p",
    "x": "Bu faaliyetlerin ŞİRKET tarafından yapılması halinde Bayi, ŞİRKET tarafından yapılacak her türlü genel reklam ve promosyon çalışmalarına destek olmak ve bunların giderlerine katkıda bulunmak zorundadır."
   },
   {
    "t": "p",
    "x": "Bayiinin reklam ve promosyon giderlerine ne miktarda katkıda bulunacağı bir önceki yıl satışları göz önünde bulunarak ŞİRKET tarafından bayiler arasında haksızlığa yol açmayacak şekilde tespit edilir."
   },
   {
    "t": "h2",
    "x": "Madde 9- Marka Kullanımı ve Sosyal Medya Kuralları;"
   },
   {
    "t": "p",
    "x": "9.1. ŞİRKET’e ait tüm tescilli ve tescilsiz markalar, logolar, ticari unvan, ambalaj tasarımları ve kurumsal kimlik unsurları (“Rota Markaları”) münhasıran ŞİRKET’e aittir. Bu sözleşme Bayi’ye marka üzerinde herhangi bir mülkiyet hakkı tanımaz."
   },
   {
    "t": "p",
    "x": "9.2. Bayi, Rota Markalarını yalnızca sözleşme kapsamındaki satış ve tanıtım faaliyetleri amacıyla ve ŞİRKET’in belirlediği kurallara uygun olarak kullanabilir."
   },
   {
    "t": "p",
    "x": "9.3. Bayi, kişisel veya kurumsal sosyal medya hesaplarında (Instagram, Facebook, YouTube, TikTok, LinkedIn, X ve benzeri platformlar) Rota Markaları ile paylaşım yaparken:"
   },
   {
    "t": "li",
    "x": "a) Yalnızca ŞİRKET’in üretip markası altında sattığı Ürünleri tanıtabilir,"
   },
   {
    "t": "li",
    "x": "b) ŞİRKET’e ait olmayan ürünleri Rota Markaları ile aynı paylaşımda, aynı hesapta veya bağlamsal olarak ilişkilendirecek biçimde kesinlikle gösteremez,"
   },
   {
    "t": "li",
    "x": "c) ŞİRKET’in sağladığı veya yazılı olarak onayladığı görselleri kullanır,"
   },
   {
    "t": "li",
    "x": "d) Ürün kalitesi veya etkileri hakkında abartılı, yanıltıcı veya gerçeğe aykırı ifadeler kullanamaz,"
   },
   {
    "t": "li",
    "x": "e) ŞİRKET’in herhangi bir paylaşımın kaldırılmasını veya düzeltilmesini talep etmesi halinde 24 saat içinde uyar."
   },
   {
    "t": "p",
    "x": "9.4. Bu maddenin ihlali — özellikle ŞİRKET’e ait olmayan ürünlerin Rota Markaları ile ilişkilendirilmesi — ağır sözleşme ihlali sayılır ve ŞİRKET’e derhal fesih ile Madde 20’deki cezai şartı talep hakkı doğurur."
   },
   {
    "t": "p",
    "x": "9.5. Sözleşmenin sona ermesinden itibaren Bayi, Rota Markalarını içeren tüm tabela, afiş, reklam materyali ve sosyal medya paylaşımlarını 30 (otuz) gün içinde kaldıracaktır."
   },
   {
    "t": "h2",
    "x": "Madde 10- Siparişler ve Teslim;"
   },
   {
    "t": "p",
    "x": "Siparişler ŞİRKET’in üretimini planlamasına yetecek kadar süre önceden bildirilmelidir. Bu süre en az teslim tarihinden önce 15 (on beş) gündür. Bu süre içinde siparişler ŞİRKET tarafından hazırlanacak ve Bayiinin teslim almasına hazır bulundurulacaktır. Teslim fabrika deposundan yapılır. Taşıma giderleri, taşıma sırasında mala gelebilecek her türlü zarar bayiye aittir."
   },
   {
    "t": "p",
    "x": "Bayi mallarının ŞİRKET tarafından taşınmasını istediği hallerde de satış fabrika teslimi olarak yapılmış sayılır; bir önceki paragraf hükümleri bu durumda da aynen uygulanır."
   },
   {
    "t": "p",
    "x": "Olağanüstü sebeplerle ya da aşırı talep nedeniyle stokların yeterli olmaması, grev, teknik arıza gibi umulmayan haller nedeniyle ŞİRKET’in kontrolünde olmayan diğer sebeplerle teslimatta gecikme olması halinde ŞİRKET’e herhangi bir sorumluluk yüklenemez."
   },
   {
    "t": "h2",
    "x": "Madde 11- Kalite Garantisi;"
   },
   {
    "t": "p",
    "x": "Sözleşme konusu Ürünlerin mevzuatta öngörülen kalite ve standartlara uygun olarak üretilmemesinden doğacak zararlar ŞİRKET’e aittir. Şu kadar ki, Bayiinin saklama koşullarına ya da son kullanma sürelerine uymama gibi kendi kusurundan kaynaklanan zararlardan sorumluluk Bayiye aittir. Üretim hakları nedeniyle bozuk olan malların bedelleri ŞİRKET tarafından ödenecektir."
   },
   {
    "t": "h2",
    "x": "Madde 12- Sözleşmeden Doğan Hakların ve Borçların Devri;"
   },
   {
    "t": "p",
    "x": "Sözleşmenin tarafları bu sözleşmeden doğan hak ve borçlarını diğer tarafın onayı olmaksızın kısmen de olsa üçüncü kişilere devredemezler. Diğer taraf haklı sebeplere dayanarak böyle bir onayı vermekten kaçınabilir."
   },
   {
    "t": "p",
    "x": "Bu hüküm sözleşme konusu Ürünlerin ŞİRKET tarafından 3. bir işletmeye ürettirilmesi veya dağıttırılmasını engellemez."
   },
   {
    "t": "h2",
    "x": "Madde 13- Müşterek Satış Politikalarına Uyma;"
   },
   {
    "t": "p",
    "x": "Bayii, sözleşme konusu Ürünlerin satışını arttırma hedefine yönelik olarak kendi satış politikalarını serbestçe tespit edip uygulayabilir. Şu kadar ki, bu politikalar ŞİRKET tarafından oluşturulan dağıtım ağının uyguladığı genel politikalara, sözleşme konusu Ürünlerin imajına ve dağıtım ağının düzgün bir şekilde işlemesine zarar vermemelidir. ŞİRKET, bayiye yeniden satış fiyatları konusunda tavsiyede bulunabilir."
   },
   {
    "t": "h2",
    "x": "Madde 14- Bayinin Dağıtımda Teknik Standartlara Uyma Zorunluluğu;"
   },
   {
    "t": "p",
    "x": "Bayi, dağıtımda kullanacağı taşıma vasıtalarını, araç ve gereçleri ŞİRKET tarafından tüm dağıtım ağında geçerli olacak şekilde tespit ettiği objektif kalite ve görünüm standartlarına uydurulacaktır."
   },
   {
    "t": "p",
    "x": "Bayiinin bölgesinin özelliklerine göre asgari bulundurulması gereken taşıma vasıtası, araç ve gerecin neler olduğu ŞİRKET tarafından tespit edilir."
   },
   {
    "t": "p",
    "x": "Taşıma vasıtalarının, araç ve gerecin satın alınması ve standartlara uydurulması ve bakım onarım giderleri bayiye aittir."
   },
   {
    "t": "h2",
    "x": "Madde 15- Ödeme Şartları;"
   },
   {
    "t": "p",
    "x": "Bayi tarafından alınan Ürünlerin bedelleri peşin olarak alınır. Bayiinin iş hacmine ve kredibilitesine göre vade yapıp yapmamakta ŞİRKET serbesttir. ŞİRKET haklı sebeplerin varlığı halinde kredili olarak çalışmakta olduğu bayi ile peşin çalışmaya dönebilir."
   },
   {
    "t": "p",
    "x": "Vadeli satışlarda taraflarca sözleşme tarihinde mutabık kalınan oranda vade farkı uygulanır. Temerrüt halinde ise yasal temerrüt faizi oranı uygulanır."
   },
   {
    "t": "p",
    "x": "Uyuşmazlık durumunda ŞİRKET defterleri HMK’nın 193. maddesi uyarınca kesin delil teşkil edecektir."
   },
   {
    "t": "p",
    "x": "Bu şekilde vadeli çalışılması halinde Bayiinin açık hesabı bulunmayacaktır, bayi çek ve senetle açık hesabını kapatacaktır."
   },
   {
    "t": "h2",
    "x": "Madde 16- Teminat;"
   },
   {
    "t": "p",
    "x": "Bayi, ŞİRKET tarafından talep edilecek teminatı (banka teminat mektubu, çek, senet vb.) sözleşmenin imzalanması sırasında veya ŞİRKET’in belirleyeceği süre içinde vermekle yükümlüdür. Teminatın türü ve miktarı ŞİRKET tarafından bayinin iş hacmi ve kredibilitesine göre belirlenir. Sözleşmenin sona ermesi halinde, Bayiinin ŞİRKET’e herhangi bir borcu bulunmaması kaydıyla teminat iade edilir."
   },
   {
    "t": "h2",
    "x": "Madde 17- Denetim ve Yardım;"
   },
   {
    "t": "p",
    "x": "ŞİRKET bayilerin kendi bölgelerinde satışlarını arttırmalarına yardımcı olmak için uygun gördüğü bölgelerde çalışmalar yapabilir. Bayi, bu gibi çalışmaların yapılmasında ŞİRKET yetkililerine yardımcı olacaktır."
   },
   {
    "t": "p",
    "x": "ŞİRKET bayilerinin özellikle teknik standartlara uymalarını sağlamak gayesi ile denetimler yapabilir ve bayiye görüş ve tavsiyelerde bulunabilir."
   },
   {
    "t": "h2",
    "x": "Madde 18- Gizlilik;"
   },
   {
    "t": "p",
    "x": "Taraflar, bu sözleşme kapsamında birbirlerine açıkladıkları veya öğrendikleri tüm ticari sırları, müşteri bilgilerini, fiyatlandırma politikalarını, üretim yöntemlerini ve diğer gizli bilgileri sözleşme süresince ve sözleşmenin sona ermesinden itibaren 3 (üç) yıl süreyle gizli tutmayı ve üçüncü kişilerle paylaşmamayı taahhüt eder. Bu yükümlülüğe aykırı davranan taraf, diğer tarafın uğradığı tüm zararları tazmin etmekle yükümlüdür."
   },
   {
    "t": "p",
    "x": "18.2. Bayi, ŞİRKET’in müşteri listelerini, TMR Yem formülasyon bilgilerini, rasyon içeriklerini, fiyat tablolarını ve maliyet yapısına ilişkin verileri kesinlikle üçüncü kişilerle paylaşmayacaktır."
   },
   {
    "t": "h2",
    "x": "Madde 19- Mücbir Sebep;"
   },
   {
    "t": "p",
    "x": "Doğal afetler, salgın hastalıklar, savaş, terör, grev, lokavt, hükümet kararları ve yasaklamalar ile tarafların kontrolü dışında kalan ve öngörülemeyen diğer olaylar mücbir sebep olarak kabul edilir. Mücbir sebebin varlığı halinde, etkilenen tarafın sözleşmeden doğan yükümlülükleri, mücbir sebep süresince askıya alınır. Mücbir sebepten etkilenen taraf, durumu diğer tarafa 7 (yedi) gün içinde yazılı olarak bildirmek zorundadır. Mücbir sebebin 90 (doksan) günden fazla sürmesi halinde taraflardan her biri sözleşmeyi feshedebilir."
   },
   {
    "t": "h2",
    "x": "Madde 20- Kişisel Verilerin Korunması (KVKK);"
   },
   {
    "t": "p",
    "x": "20.1. Taraflar, bu sözleşme kapsamında elde ettikleri kişisel verileri 6698 sayılı Kişisel Verilerin Korunması Kanunu ve ilgili mevzuat hükümlerine uygun olarak işlemeyi, saklamayı ve korumayı taahhüt eder."
   },
   {
    "t": "p",
    "x": "20.2. Bayi, sözleşme kapsamındaki faaliyetleri sırasında eriştiği müşterilere ve üçüncü kişilere ait kişisel verileri:"
   },
   {
    "t": "li",
    "x": "a) Yalnızca sözleşme konusu faaliyetlerin yürütülmesi amacıyla işleyecektir,"
   },
   {
    "t": "li",
    "x": "b) ŞİRKET’in yazılı onayı olmaksızın üçüncü kişilere aktarmayacaktır,"
   },
   {
    "t": "li",
    "x": "c) Veri güvenliğinin sağlanması için gerekli idari ve teknik tedbirleri alacaktır,"
   },
   {
    "t": "li",
    "x": "d) Sözleşmenin sona ermesi halinde bu verileri ŞİRKET’e iade edecek veya ŞİRKET’in talimatı doğrultusunda imha edecektir."
   },
   {
    "t": "p",
    "x": "20.3. Herhangi bir veri ihlali durumunda, ihlali tespit eden taraf diğer tarafa en geç 48 (kırk sekiz) saat içinde yazılı bildirimde bulunacak ve Kişisel Verileri Koruma Kurulu’na 72 saat içinde bildirim yapılmasını sağlayacaktır."
   },
   {
    "t": "p",
    "x": "20.4. KVKK hükümlerine aykırı davranıştan kaynaklanan her türlü idari para cezası, tazminat ve hukuki sorumluluk, ihlali gerçekleştiren tarafa aittir."
   },
   {
    "t": "h2",
    "x": "Madde 21- Cezai Şart;"
   },
   {
    "t": "p",
    "x": "21.1. Bayinin bu sözleşmede yer alan rekabet yasağına (Madde 7), marka kullanım kurallarına (Madde 9), gizlilik yükümlülüğüne (Madde 18) veya KVKK hükümlerine (Madde 20) aykırı davranması halinde, ŞİRKET’in uğradığı zararları tazmin hakkı saklıdır. Bu cezai şartın ödenmesi, ihlal eden tarafın sözleşmeden doğan diğer yükümlülüklerini ortadan kaldırmaz."
   },
   {
    "t": "p",
    "x": "21.2. ŞİRKET’in Bayi’ye karşı yükümlülüklerini (Ürün tedariki, teminat iadesi, haklı fesih tazminatı vb.) yazılı ihtara rağmen 30 (otuz) gün içinde yerine getirmemesi halinde, Bayi’nin zararlarını tazmin talep hakkı ile sözleşmeyi haklı nedenle fesih hakkı saklıdır."
   },
   {
    "t": "h2",
    "x": "Madde 22- Sözleşmenin Süresi;"
   },
   {
    "t": "p",
    "x": "Sözleşme süresiz olarak akdedilmiştir."
   },
   {
    "t": "h2",
    "x": "Madde 23- Sözleşmenin Feshi;"
   },
   {
    "t": "p",
    "x": "Taraflar dilediği zaman en az 60 (altmış) gün önceden yazılı bildirim yapmak kaydıyla bayilik sözleşmesini feshedebilirler."
   },
   {
    "t": "h2",
    "x": "Madde 24- Haklı Sebeplerle Fesih;"
   },
   {
    "t": "p",
    "x": "Bayiinin hedefleri tutturamaması, hedeflerden hoş görülemeyecek kadar geride kalması, gerekli taşıma vasıtalarını almaması ya da bunları standartlara uydurmaması, borçlarını ödemekte gecikmesi, rakip ürünlerin satışı veya üretimi ile uğraşması, kendi bölgesi dışında doğrudan veya dolaylı olarak aktif ticari politikalar izlemesi, dağıtım ağına veya sözleşme konusu Ürünlerin imajına zarar verici davranışlarda bulunması, marka kullanım ve sosyal medya kurallarını ihlal etmesi ve bu sözleşmenin yüklediği diğer yükümlülükleri yerine getirmemesi sözleşmenin feshi için haklı sebep olarak kabul edilir."
   },
   {
    "t": "h2",
    "x": "Madde 25- Diğer Sebeplerle Sözleşmenin Feshi;"
   },
   {
    "t": "p",
    "x": "Bayiinin ölümü ya da çalışamaz hale gelmesi halinde sözleşme ŞİRKET tarafından feshedilir. Ölüm halinde mirasçılarla devam edip etmemekte ŞİRKET tamamen serbesttir."
   },
   {
    "t": "bos"
   },
   {
    "t": "h2",
    "x": "Madde 26- Feshin Sonuçları;"
   },
   {
    "t": "p",
    "x": "26.1. Sözleşmenin herhangi bir nedenle sona ermesi halinde Bayi:"
   },
   {
    "t": "li",
    "x": "a) Elindeki Rota Markaları taşıyan tüm tabela, afiş, reklam materyallerini 30 (otuz) gün içinde sökerek ŞİRKET’e iade eder veya imha eder,"
   },
   {
    "t": "li",
    "x": "b) Rota Markaları ile ilişkili tüm sosyal medya paylaşımlarını 30 (otuz) gün içinde kaldırır,"
   },
   {
    "t": "li",
    "x": "c) ŞİRKET’e ait müşteri verilerini, belgeleri ve elektronik verileri 15 (on beş) gün içinde ŞİRKET’e iade eder,"
   },
   {
    "t": "li",
    "x": "d) Rota Markalarını kullanmayı derhal durdurur,"
   },
   {
    "t": "li",
    "x": "e) Elindeki sözleşme konusu Ürün stoklarını, ŞİRKET’in uygun görmesi halinde, ŞİRKET’e fesih tarihindeki güncel bayi fiyatı üzerinden iade edebilir."
   },
   {
    "t": "p",
    "x": "26.2. Fesih tarihine kadar hak edilmiş alacaklar, fesih tarihinden itibaren 30 (otuz) gün içinde ödenir."
   },
   {
    "t": "p",
    "x": "26.3. Gizlilik (Madde 18), KVKK (Madde 20), rekabet yasağı (Madde 7.3) ve marka koruma (Madde 9.5) yükümlülükleri sözleşmenin sona ermesinden sonra da geçerliliğini korur."
   },
   {
    "t": "h2",
    "x": "Madde 27- Bildirimler ve Tebligat;"
   },
   {
    "t": "p",
    "x": "27.1. Taraflar, bu sözleşmede belirtilen adreslerini yasal tebligat adresleri olarak kabul ederler."
   },
   {
    "t": "p",
    "x": "27.2. Adres değişiklikleri, değişiklik tarihinden itibaren 15 (on beş) gün içinde diğer tarafa yazılı olarak bildirilecektir. Bildirim yapılmadıkça, mevcut adrese yapılan tebligatlar geçerli kabul edilecektir."
   },
   {
    "t": "p",
    "x": "27.3. Sözleşme kapsamındaki bildirimler noter ihtarnamesi, iadeli taahhütlü mektup veya KEP (Kayıtlı Elektronik Posta) aracılığıyla yapılabilir."
   },
   {
    "t": "h2",
    "x": "Madde 28- Uygulanacak Hukuk ve Uyuşmazlık Çözümü;"
   },
   {
    "t": "p",
    "x": "28.1. Bu sözleşme Türk hukukuna tabidir ve Türk hukuku hükümlerine göre yorumlanır."
   },
   {
    "t": "p",
    "x": "28.2. Sözleşmeden doğan uyuşmazlıklarda BALIKESİR Mahkemeleri ve İcra Daireleri münhasıran yetkilidir."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "İşbu sözleşme 28 (yirmi sekiz) madde ve 6(altı) sayfadan oluşmakta olup, ....../....../.............. tarihinde üç nüsha olarak taraflarca imzalanmıştır."
   },
   {
    "t": "imza",
    "sol": [
     "ŞİRKET",
     "Rota SMI Tarım ve Hayvancılık",
     "San. Tic. A.Ş.",
     "Yetkili: İbrahim ÜRENLİOĞLU"
    ],
    "sag": [
     "BAYİ",
     "{unvan}"
    ]
   },
   {
    "t": "p",
    "x": "EKLER:"
   },
   {
    "t": "p",
    "x": "EK-A : Yeni Bayi & Doğrudan Müşteri Atama Formu"
   },
   {
    "t": "p",
    "x": "EK-B : Bayi/Müşteri KVKK Aydınlatma Metni"
   }
  ]
 },
 "bayiAtama": {
  "ad": "Yeni Bayi & Doğrudan Müşteri Atama Formu",
  "bloklar": [
   {
    "t": "h1",
    "x": "YENİ BAYİ & DOĞRUDAN MÜŞTERİ ATAMA FORMU"
   },
   {
    "t": "h3",
    "x": "1. BAŞVURU TÜRÜ"
   },
   {
    "t": "bos"
   },
   {
    "t": "tbl",
    "rows": [
     [
      "□  BAYİ",
      "□  DOĞRUDAN MÜŞTERİ"
     ]
    ]
   },
   {
    "t": "bos"
   },
   {
    "t": "h3",
    "x": "2. ŞİRKET / İŞLETME BİLGİLERİ"
   },
   {
    "t": "bos"
   },
   {
    "t": "tbl",
    "rows": [
     [
      "Şirket / İşletme Adı",
      "{sirketAdi}"
     ],
     [
      "Adresi",
      "{adres}"
     ],
     [
      "Vergi Dairesi",
      "{vergiDairesi}",
      "Vergi No",
      "{vergiNo}"
     ],
     [
      "Ticaret Sicil No",
      "{ticaretSicil}",
      "MERSİS No",
      "{mersis}"
     ],
     [
      "İş Telefonu",
      "{isTel}",
      "Faks",
      "{faks}"
     ],
     [
      "GSM (1)",
      "{gsm1}",
      "GSM (2)",
      "{gsm2}"
     ],
     [
      "E-posta Adresi",
      "{eposta}"
     ],
     [
      "IBAN / Banka Bilgileri",
      "{iban}"
     ],
     [
      "Oluşturulacak Teminat Şekli ve Miktarı",
      "{teminat}"
     ],
     [
      "Ödeme Şekli ve Beklenen Satış (ton/ay)",
      "{odemeSatis}"
     ],
     [
      "Düşünceler",
      "{dusunceler}"
     ]
    ]
   },
   {
    "t": "bos"
   },
   {
    "t": "h3",
    "x": "3. YETKİLİ KİŞİLER VE ÇALIŞANLAR"
   },
   {
    "t": "bos"
   },
   {
    "t": "tbl",
    "rows": [
     [
      "#",
      "Adı Soyadı",
      "T.C. Kimlik No",
      "Görevi / Pozisyonu",
      "Telefon"
     ],
     [
      "1",
      "{y1ad}",
      "{y1tc}",
      "{y1gorev}",
      "{y1tel}"
     ],
     [
      "2",
      "{y2ad}",
      "{y2tc}",
      "{y2gorev}",
      "{y2tel}"
     ]
    ],
    "bas": true
   },
   {
    "t": "bos"
   },
   {
    "t": "h3",
    "x": "5. BAYİ / MÜŞTERİ ONAYI"
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Yukarıda beyan ettiğim bilgilerin doğru ve eksiksiz olduğunu, bayilik/müşteri atama sürecinde talep edilen belgeleri teslim edeceğimi kabul ve beyan ederim."
   },
   {
    "t": "tbl",
    "rows": [
     [
      "KAŞE",
      "YETKİLİ İMZA\nAdı Soyadı: .....................................\nTarih: ....../....../...............\nİmza: ....................................."
     ]
    ]
   }
  ]
 },
 "danismanSozlesme": {
  "ad": "Teknik Danışmanlık ve Satış-Pazarlama Hizmeti Sözleşmesi",
  "bloklar": [
   {
    "t": "h1",
    "x": "TEKNİK DANIŞMANLIK VE SATIŞ-PAZARLAMA HİZMETİ SÖZLEŞMESİ"
   },
   {
    "t": "h2",
    "x": "MADDE 1 — SÖZLEŞMENİN TARAFLARI"
   },
   {
    "t": "p",
    "x": "Bu sözleşme, bir tarafta Rota SMI Tarım Hayvancılık Sanayi Ticaret A.Ş. (bundan sonra “SATICI” olarak anılacaktır) ile diğer tarafta [……………………….] (bundan sonra “HİZMET VEREN” olarak anılacaktır) arasında, aşağıda belirtilen şartlar dahilinde akdedilmiştir. SATICI ve HİZMET VEREN birlikte “TARAFLAR” olarak anılacaktır."
   },
   {
    "t": "p",
    "x": "SATICI"
   },
   {
    "t": "kv",
    "k": "Unvanı",
    "v": "Rota SMI Tarım Hayvancılık Sanayi Ticaret A.Ş."
   },
   {
    "t": "kv",
    "k": "Adresi",
    "v": "Gümüşçeşme Mah. 8175. Sk. Ticaret Borsası Sitesi C Blok No:6/19B Altıeylül/BALİKESİR"
   },
   {
    "t": "kv",
    "k": "Vergi Dairesi / No",
    "v": "Kurtdereli    /     735 207 6619"
   },
   {
    "t": "kv",
    "k": "Telefon",
    "v": "0266 249 07 77"
   },
   {
    "t": "kv",
    "k": "E-posta",
    "v": "muhasebe@rotasmi.com.tr"
   },
   {
    "t": "p",
    "x": "HİZMET VEREN"
   },
   {
    "t": "kv",
    "k": "Adı Soyadı",
    "v": "{adSoyad}"
   },
   {
    "t": "kv",
    "k": "T.C. Kimlik No",
    "v": "{tcKimlik}"
   },
   {
    "t": "kv",
    "k": "Vergi Dairesi / No",
    "v": "{vergiDaireNo}"
   },
   {
    "t": "kv",
    "k": "Adresi",
    "v": "{adres}"
   },
   {
    "t": "kv",
    "k": "Telefon / GSM",
    "v": "{telefon}"
   },
   {
    "t": "kv",
    "k": "E-posta",
    "v": "{eposta}"
   },
   {
    "t": "kv",
    "k": "IBAN",
    "v": "{iban}"
   },
   {
    "t": "h2",
    "x": "MADDE 2 — TANIMLAR"
   },
   {
    "t": "p",
    "x": "Bu sözleşmede geçen;"
   },
   {
    "t": "p",
    "x": "“Ürünler”: SATICI tarafından üretilen TMR (Total Mixed Ration / Toplam Karışım Rasyon) yem ürünleri ile SATICI’nın üretip markası altında piyasaya sunduğu diğer yem ve yem katkı maddelerini,"
   },
   {
    "t": "p",
    "x": "“TMR Yem”: SATICI tarafından geliştirilen ve üretilen, hayvan besleme için hazır karışım rasyon nitelikli yem ürünlerini; SATICI’nın tescilli markaları, ticari adları ve ambalaj tasarımları altında satışa sunulan ürünleri,"
   },
   {
    "t": "p",
    "x": "“Müşteriler”: SATICI’nın mevcut ve potansiyel alıcılarını (çiftlikler, bayiler, kooperatifler, hayvancılık işletmeleri, besiciler vb.),"
   },
   {
    "t": "p",
    "x": "“Gizli Bilgi”: Tarafların birbirlerine açıkladığı veya sözleşme kapsamında öğrendiği her türlü ticari, mali, teknik bilgi ile müşteri listelerini, fiyatlandırma politikalarını, formülasyonları, rasyon içeriklerini ve üretim süreçlerini,"
   },
   {
    "t": "p",
    "x": "“Rota Markaları”: SATICI’ya ait tüm tescilli ve tescilsiz markalar, ticari adlar, logolar, ambalaj tasarımları, sloganlar ve kurumsal kimlik unsurlarını,"
   },
   {
    "t": "p",
    "x": "“Hizmet Bedeli”: Madde 6’da belirlenen ödeme koşullarına göre HİZMET VEREN’e ödenecek tutarı,"
   },
   {
    "t": "p",
    "x": "ifade eder."
   },
   {
    "t": "h2",
    "x": "MADDE 3 — SÖZLEŞMENİN KONUSU VE AMACI"
   },
   {
    "t": "p",
    "x": "3.1. Bu sözleşmenin konusu; HİZMET VEREN tarafından SATICI’nın üretimini gerçekleştirdiği TMR Yem başta olmak üzere tüm ürünlerin pazarlanması, satışının desteklenmesi, çiftlik ve bayilere teknik danışmanlık hizmeti verilmesi ile saha ziyaretleri yapılmasıdır."
   },
   {
    "t": "p",
    "x": "3.2. HİZMET VEREN, bağımsız yüklenici sıfatıyla hareket edecek olup, SATICI’nın çalışanı değildir. Taraflar arasındaki ilişki bir iş akdi (hizmet sözleşmesi) niteliği taşımamaktadır. HİZMET VEREN’in SGK ve vergi yükümlülükleri kendisine aittir."
   },
   {
    "t": "p",
    "x": "3.3. HİZMET VEREN, faaliyetlerini SATICI’nın genel stratejik yönlendirmeleri doğrultusunda ancak kendi çalışma düzenini serbestçe belirleyerek yürütecektir."
   },
   {
    "t": "p",
    "x": "3.4. HİZMET VEREN’in pazarlama ve danışmanlık faaliyetleri münhasıran SATICI’nın ürettiği ve markası altında sattığı ürünlerle sınırlıdır. HİZMET VEREN, Rota Markaları ile ilişkilendirilebilecek herhangi bir faaliyette yalnızca SATICI’nın ürünlerini tanıtabilir ve satışını destekleyebilir."
   },
   {
    "t": "h2",
    "x": "MADDE 4 — HİZMETİN KAPSAMI VE İÇERİĞİ"
   },
   {
    "t": "p",
    "x": "HİZMET VEREN, sözleşme süresince aşağıdaki hizmetleri yerine getirecektir:"
   },
   {
    "t": "p",
    "x": "4.1. Pazarlama ve Satış Desteği: SATICI’nın TMR Yem ürünlerini ve diğer ürünlerini tanıtmak, yeni müşteri portföyü oluşturmak, mevcut müşterilerle ilişkileri güçlendirmek ve satış hacmini artırmaya yönelik faaliyetlerde bulunmak."
   },
   {
    "t": "p",
    "x": "4.2. Teknik Danışmanlık: müşterilere SATICI’nın TMR Yem ürünlerinin kullanımı, dozajı, beslenme programları, hayvan sağlığı ve verimlilik artırma konularında sahada teknik destek ve danışmanlık vermek."
   },
   {
    "t": "p",
    "x": "4.3. Bilgi Aktarımı ve Raporlama: müşterilerin ihtiyaç, talep ve şikayetlerini düzenli olarak SATICI’ya raporlamak; pazar koşulları, rekabet durumu ve fiyat hareketleri hakkında SATICI’yı bilgilendirmek."
   },
   {
    "t": "p",
    "x": "4.4. Saha Ziyaretleri: Çiftlik, bayi ve diğer satış noktalarına periyodik saha ziyaretleri gerçekleştirmek; ziyaret raporlarını SATICI ile paylaşmak."
   },
   {
    "t": "p",
    "x": "4.5. Tahsilat Desteği: Satış gerçekleştirilen müşterilerden alacakların takibi konusunda SATICI’ya bilgi ve destek sağlamak."
   },
   {
    "t": "p",
    "x": "4.6. Eğitim ve Fuar Katılımı: SATICI’nın düzenleyeceği veya katılacağı fuar, seminer, bayi toplantısı gibi etkinliklere davet edildiğinde katılım sağlamak."
   },
   {
    "t": "bos"
   },
   {
    "t": "h2",
    "x": "MADDE 5 — TARAFLARIN YÜKÜMÜLLÜKLERİ"
   },
   {
    "t": "p",
    "x": "5.1. HİZMET VEREN’in Yükümlülükleri:"
   },
   {
    "t": "li",
    "x": "a) Hizmetlerini özenle, mesleki yetkinlik ve dürüstlük ilkeleri çerçevesinde yerine getirmek."
   },
   {
    "t": "li",
    "x": "b) SATICI’nın ticari itibarını, marka değerini ve müşteri ilişkilerini korumak; SATICI’nın menfaatlerine aykırı davranışlardan kaçınmak."
   },
   {
    "t": "li",
    "x": "c) SATICI’nın rakibi olan firma veya firmalarla doğrudan ya da dolaylı olarak aynı konuda danışmanlık veya pazarlama hizmeti sözleşmesi akdetmemek (rekabet yasağı)."
   },
   {
    "t": "li",
    "x": "d) SATICI tarafından sağlanan tanıtım materyallerini, numuneleri ve teknik dokümanları sözleşme amaçları dışında kullanmamak."
   },
   {
    "t": "li",
    "x": "e) Faaliyetleri hakkında SATICI’ya aylık yazılı rapor sunmak (ziyaret edilen müşteriler, yapılan satışlar, pazar gözlemleri)."
   },
   {
    "t": "li",
    "x": "f) SATICI adına herhangi bir taahhüt veya sözleşme yapmamak; yalnızca SATICI’nın yazılı yetkisi dahilinde hareket etmek."
   },
   {
    "t": "li",
    "x": "g) Sözleşme süresince ve sona ermesinden itibaren Madde 8’deki gizlilik yükümlülüklerine ve Madde 10’daki marka kullanım kurallarına uymak."
   },
   {
    "t": "li",
    "x": "h) Rota Markaları altında veya Rota Markaları ile ilişkilendirilebilecek herhangi bir şekilde, SATICI’ya ait olmayan ürünlerin tanıtımını, pazarlamasını veya satışını yapmamak. Bu yasak; sosyal medya paylaşımları, saha ziyaretleri, fuar/seminer katılımları ve müşterilerle yapılan her türlü yazılı/sözlü iletişim dahil olmak üzere tüm kanalları kapsar."
   },
   {
    "t": "li",
    "x": "i) Kişisel sosyal medya hesapları dahil hiçbir platformda, SATICI’nın üretmediği veya SATICI’nın onaylamadığı ürünleri Rota Markaları veya SATICI ile doğrudan ya da dolaylı olarak ilişkilendirecek şekilde paylaşımda bulunmamak. Üçüncü taraf ürünlerinin, Rota’nın ürün yelpazesine dahilmiş gibi gösterilmesi veya bu izlenimi yaratacak herhangi bir paylaşım yapılması ağır sözleşme ihlali sayılır."
   },
   {
    "t": "p",
    "x": "5.2. SATICI’nın Yükümlülükleri:"
   },
   {
    "t": "li",
    "x": "a) HİZMET VEREN’in faaliyetlerini yürütebilmesi için gerekli ürün bilgilerini, teknik dokümanları, fiyat listelerini ve tanıtım materyallerini zamanında sağlamak."
   },
   {
    "t": "li",
    "x": "b) HİZMET VEREN tarafından yönlendirilen müşterilere ilişkin satış süreçlerini etkin bir şekilde yürütmek."
   },
   {
    "t": "li",
    "x": "c) Hizmet Bedelini Madde 6’da belirtilen koşullara uygun olarak ve zamanında ödemek."
   },
   {
    "t": "li",
    "x": "d) Pazar koşullarındaki önemli değişiklikler, ürün fiyat güncellemeleri ve kampanyalar hakkında HİZMET VEREN’i bilgilendirmek."
   },
   {
    "t": "h2",
    "x": "MADDE 6 — HİZMET BEDELİ VE ÖDEME KOŞULLARI"
   },
   {
    "t": "p",
    "x": "6.1. HİZMET VEREN’e ödenecek Hizmet Bedeli, her bir satış ve danışmanlık hizmeti için ürünlerin fiyatı, satış hacmi ve hizmet kapsamı dikkate alınarak taraflarca birlikte belirlenecektir."
   },
   {
    "t": "p",
    "x": "6.2. Ödeme tutarları ve dönemleri, ilgili satış/hizmet dönemine ait verilere göre tarafların karşılıklı mutabakatıyla kesinleştirilecek ve mutabakat tutanağı ile belgelenecektir."
   },
   {
    "t": "p",
    "x": "6.3. Ödemeler, mutabakat tarihinden itibaren en geç [15] (on beş) iş günü içinde HİZMET VEREN’in yukarıda belirtilen IBAN hesabına banka havalesi yoluyla yapılacaktır. HİZMET VEREN tarafından talep edilen IBAN değişiklikleri yazılı olarak bildirilmek zorundadır."
   },
   {
    "t": "p",
    "x": "6.4. Hizmet Bedeli tutarlarına KDV dahildir. HİZMET VEREN tarafından düzenlenecek serbest meslek makbuzu / fatura üzerinde gösterilecektir."
   },
   {
    "t": "p",
    "x": "6.5. HİZMET VEREN’in yol, konaklama ve iaşe giderleri kural olarak kendisine aittir."
   },
   {
    "t": "h2",
    "x": "MADDE 7 — GİZLİLİK VE TİCARİ SIRLARIN KORUNMASI"
   },
   {
    "t": "p",
    "x": "7.1. Taraflar, bu sözleşme kapsamında birbirlerine açıkladıkları veya sözleşmenin ifası sırasında öğrendikleri tüm Gizli Bilgileri, sözleşme süresince ve sözleşmenin herhangi bir nedenle sona ermesinden itibaren 3 (üç) yıl süreyle gizli tutmayı, üçüncü kişilerle paylaşmamayı ve yalnızca sözleşme amaçları doğrultusunda kullanmayı kabul ve taahhüt eder."
   },
   {
    "t": "p",
    "x": "7.2. Gizlilik yükümlülüğü; kamuya mal olmuş bilgiler, yasal zorunluluk gereği açıklanması gereken bilgiler ve üçüncü kişilerden gizlilik ihlali olmaksızın elde edilen bilgiler açısından uygulanmaz."
   },
   {
    "t": "p",
    "x": "7.3. HİZMET VEREN, SATICI’nın müşteri listelerini, fiyat tablolarını, TMR Yem formülasyon bilgilerini, rasyon içeriklerini, üretim kapasitesi ve maliyet yapısına ilişkin verileri kesinlikle üçüncü kişilerle paylaşmayacaktır."
   },
   {
    "t": "p",
    "x": "7.4. HİZMET VEREN, sözleşmenin sona ermesi halinde, SATICI’ya ait her türlü belge, doküman, numune ve elektronik verilerin aslını ve kopyalarını 15 (on beş) gün içinde SATICI’ya iade edecektir."
   },
   {
    "t": "p",
    "x": "7.5. Gizlilik yükümlülüğüne aykırı davranan taraf, diğer tarafın uğradığı doğrudan ve dolaylı tüm zararları tazmin etmekle yükümlüdür. Ayrıca Madde 13’teki cezai şart hükümleri saklıdır."
   },
   {
    "t": "h2",
    "x": "MADDE 8 — KİŞİSEL VERİLERİN KORUNMASI (KVKK)"
   },
   {
    "t": "p",
    "x": "8.1. Taraflar, bu sözleşme kapsamında elde ettikleri kişisel verileri 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve ilgili ikincil mevzuat hükümlerine uygun olarak işlemeyi, saklamayı ve korumayı kabul ve taahhüt eder."
   },
   {
    "t": "p",
    "x": "8.2. HİZMET VEREN, sözleşme kapsamındaki faaliyetleri sırasında eriştiği müşterilere ve üçüncü kişilere ait kişisel verileri:"
   },
   {
    "t": "li",
    "x": "a) Yalnızca sözleşme konusu hizmetlerin ifası amacıyla işleyecektir,"
   },
   {
    "t": "li",
    "x": "b) SATICI’nın yazılı onayı olmaksızın üçüncü kişilere aktarmayacaktır,"
   },
   {
    "t": "li",
    "x": "c) Veri güvenliğinin sağlanması için gerekli idari ve teknik tedbirleri alacaktır,"
   },
   {
    "t": "li",
    "x": "d) Sözleşmenin sona ermesi halinde bu verileri SATICI’ya iade edecek veya SATICI’nın talimatı doğrultusunda imha edecektir."
   },
   {
    "t": "p",
    "x": "8.3. SATICI, HİZMET VEREN’e ait kişisel verileri yalnızca sözleşme yükümlülüklerinin yerine getirilmesi, yasal yükümlülüklerin karşılanması ve meşru menfaat kapsamında işleyecektir."
   },
   {
    "t": "p",
    "x": "8.4. Kişisel veri sahiplerinin KVKK’nın 11. maddesi kapsamındaki hakları (bilgi edinme, düzeltme, silme, itiraz vb.) saklıdır."
   },
   {
    "t": "p",
    "x": "8.5. Herhangi bir veri ihlali durumunda, ihlali tespit eden taraf diğer tarafa en geç 48 (kırk sekiz) saat içinde yazılı bildirimde bulunacak ve Kişisel Verileri Koruma Kurulu’na 72 saat içinde bildirim yapılmasını sağlayacaktır."
   },
   {
    "t": "p",
    "x": "8.6. KVKK hükümlerine aykırı davranıştan kaynaklanan her türlü idari para cezası, tazminat ve hukuki sorumluluk, ihlali gerçekleştiren tarafa aittir."
   },
   {
    "t": "h2",
    "x": "MADDE 9 — FİKRİ MÜLKİYET, MARKA KULLANIMI VE SOSYAL MEDYA KURALLARI"
   },
   {
    "t": "p",
    "x": "9.1. Marka Mülkiyeti:"
   },
   {
    "t": "p",
    "x": "SATICI’ya ait tüm Rota Markaları (tescilli ve tescilsiz markalar, logolar, ticari unvan, slogan, ambalaj tasarımları, kurumsal kimlik unsurları) münhasıran SATICI’ya aittir. Bu sözleşme HİZMET VEREN’e marka üzerinde herhangi bir mülkiyet hakkı tanımaz."
   },
   {
    "t": "p",
    "x": "9.2. Kullanım Sınırları:"
   },
   {
    "t": "p",
    "x": "HİZMET VEREN, Rota Markalarını yalnızca sözleşme kapsamındaki pazarlama faaliyetleri amacıyla ve SATICI’nın belirlediği marka kullanım kurallarına uygun olarak kullanabilir. Bu kullanım hakkı sözleşmenin sona ermesiyle kendiliğinden sona erer."
   },
   {
    "t": "p",
    "x": "9.3. Sosyal Medya Kuralları:"
   },
   {
    "t": "p",
    "x": "HİZMET VEREN’in kişisel sosyal medya hesaplarında (Instagram, Facebook, YouTube, TikTok, LinkedIn, X/Twitter ve benzeri platformlar) SATICI’nın ürünleri hakkında paylaşım yapması aşağıdaki kurallara tabidir:"
   },
   {
    "t": "li",
    "x": "a) Paylaşımlarda yalnızca SATICI’nın üretip markası altında sattığı ürünler tanıtılabilir. SATICI’ya ait olmayan ürünler, Rota Markaları veya SATICI’nın adıyla birlikte, aynı paylaşımda, aynı hesapta veya bağlamsal olarak ilişkilendirilecek biçimde kesinlikle gösterilemez."
   },
   {
    "t": "li",
    "x": "b) Üçüncü taraf ürünlerinin (SATICI’nın üretmediği veya onaylamadığı yem, katkı maddesi veya diğer ürünlerin) Rota’nın ürün yelpazesine dahilmiş gibi gösterilmesi, bu izlenimi verecek görsellerin/videoların paylaşılması veya Rota Markaları ile aynı içerikte sunulması kesinlikle yasaktır."
   },
   {
    "t": "li",
    "x": "c) SATICI’nın logosunu, ticari adını veya kurumsal görsellerini içeren paylaşımlarda, yalnızca SATICI’nın sağladığı veya yazılı olarak onayladığı görseller kullanılabilir."
   },
   {
    "t": "li",
    "x": "d) HİZMET VEREN, paylaşımlarında SATICI’nın ürün kalitesini, içeriğini veya etkilerini abartacak, yanıltıcı veya gerçeğe aykırı nitelikte ifadeler kullanamaz."
   },
   {
    "t": "li",
    "x": "e) SATICI, HİZMET VEREN’in yapmış olduğu herhangi bir sosyal medya paylaşımının kaldırılmasını veya düzeltilmesini talep edebilir. HİZMET VEREN bu taleplere 24 (yirmi dört) saat içinde uymak zorundadır."
   },
   {
    "t": "li",
    "x": "f) Sözleşmenin sona ermesinden itibaren HİZMET VEREN, Rota Markalarını içeren tüm sosyal medya paylaşımlarını 30 (otuz) gün içinde kaldıracak veya SATICI’ya atıfları kaldıracaktır."
   },
   {
    "t": "p",
    "x": "9.4. İhlal Yaptırımı:"
   },
   {
    "t": "p",
    "x": "Bu maddenin ihlali — özellikle SATICI’ya ait olmayan ürünlerin Rota Markaları ile ilişkilendirilmesi — ağır sözleşme ihlali sayılır ve SATICI’ya herhangi bir süre şartı aranmaksızın derhal fesih ve Madde 13’teki cezai şartı talep hakkı doğurur. Bunun yanı sıra SATICI, ihlalden kaynaklanan marka değer kaybı ve ticari itibar zararı için tazminat talep hakkını saklı tutar."
   },
   {
    "t": "p",
    "x": "9.5. Üretilen İçeriklerin Mülkiyeti:"
   },
   {
    "t": "p",
    "x": "HİZMET VEREN’in hizmet kapsamında ürettiği raporlar, analizler, müşteri veri tabanları, saha gözlem notları ve benzeri çalışmalar SATICI’ya aittir."
   },
   {
    "t": "h2",
    "x": "MADDE 10 — SÖZLEŞMENİN SÜRESİ VE YENİLEME"
   },
   {
    "t": "p",
    "x": "10.1. Bu sözleşme, imza tarihinden itibaren 1 (bir) yıl süreyle geçerlidir."
   },
   {
    "t": "p",
    "x": "10.2. Sözleşme süresinin bitiminden en az 30 (otuz) gün önce taraflardan herhangi biri yazılı bildirimde bulunarak sözleşmeyi sona erdirmediği takdirde, sözleşme aynı koşullarla 1 (bir) yıl süreyle kendiliğinden yenilenir."
   },
   {
    "t": "p",
    "x": "10.3. Otomatik yenileme halinde, Hizmet Bedeli koşulları taraflarca yeniden müzakere edilebilir."
   },
   {
    "t": "h2",
    "x": "MADDE 11 — SÖZLEŞMENİN FESHİ"
   },
   {
    "t": "p",
    "x": "11.1. Olağan Fesih:"
   },
   {
    "t": "p",
    "x": "Taraflardan her biri, sözleşme süresinin bitiminden en az 30 (otuz) gün önce diğer tarafa noter aracılığıyla veya iadeli taahhütlü posta yoluyla yazılı bildirimde bulunarak sözleşmeyi feshedebilir."
   },
   {
    "t": "p",
    "x": "11.2. Haklı Nedenle Fesih:"
   },
   {
    "t": "p",
    "x": "Aşağıdaki hallerde, taraflar herhangi bir süre şartına bağlı olmaksızın sözleşmeyi derhal feshedebilir:"
   },
   {
    "t": "li",
    "x": "a) Taraflardan birinin sözleşmeden doğan esaslı yükümlülüklerini ihlal etmesi ve yazılı ihtara rağmen 15 (on beş) gün içinde aykırılığı gidermemesi,"
   },
   {
    "t": "li",
    "x": "b) HİZMET VEREN’in gizlilik yükümlülüğünü (Madde 8), marka kullanım kurallarını veya sosyal medya kurallarını (Madde 10) ihlal etmesi,"
   },
   {
    "t": "li",
    "x": "c) HİZMET VEREN’in SATICI’ya ait olmayan ürünleri Rota Markaları ile ilişkilendirmesi (Madde 5.1.h ve 5.1.i),"
   },
   {
    "t": "li",
    "x": "d) HİZMET VEREN’in rekabet yasağını ihlal etmesi,"
   },
   {
    "t": "li",
    "x": "e) HİZMET VEREN’in SATICI adına yetkisiz taahhütlerde bulunması,"
   },
   {
    "t": "li",
    "x": "f) Taraflardan birinin iflas etmesi, konkordato ilan etmesi veya tasfiye sürecine girmesi,"
   },
   {
    "t": "li",
    "x": "g) HİZMET VEREN’in SATICI’nın ticari itibarını zedeleyecek davranışlarda bulunması."
   },
   {
    "t": "p",
    "x": "11.3. Feshin Sonuçları:"
   },
   {
    "t": "li",
    "x": "a) Fesih tarihine kadar hak edilmiş Hizmet Bedeli tutarları, fesih tarihinden itibaren 30 (otuz) gün içinde ödenir."
   },
   {
    "t": "li",
    "x": "b) HİZMET VEREN, elindeki tüm belge, numune, tanıtım materyali ve müşteri verilerini 15 (on beş) gün içinde SATICI’ya iade eder."
   },
   {
    "t": "li",
    "x": "c) Gizlilik (Madde 8), KVKK (Madde 9) ve marka koruma (Madde 10) yükümlülükleri sözleşmenin sona ermesinden sonra da geçerliliğini korur."
   },
   {
    "t": "li",
    "x": "d) HİZMET VEREN, Rota Markalarını içeren tüm sosyal medya paylaşımlarını 30 gün içinde kaldırır."
   },
   {
    "t": "h2",
    "x": "MADDE 12 — CEZAİ ŞART"
   },
   {
    "t": "p",
    "x": "12.1. HİZMET VEREN’in rekabet yasağına (Madde 5.1.c), gizlilik yükümlülüğüne (Madde 8), marka kullanım kurallarına ve sosyal medya kurallarına (Madde 10) veya KVKK hükümlerine (Madde 9) aykırı davranması halinde, SATICI’nın uğradığı zararları tazmin hakkı saklıdır."
   },
   {
    "t": "p",
    "x": "12.2. Özellikle SATICI’ya ait olmayan ürünlerin Rota Markaları ile ilişkilendirilmesi suretiyle marka değerinin zedelenmesi halinde, SATICI cezai şartın yanı sıra marka değer kaybı ve ticari itibar zararı için ayrıca tazminat talep hakkını saklı tutar."
   },
   {
    "t": "p",
    "x": "12.3. Cezai şartın ödenmesi, ihlal eden tarafın sözleşmeden doğan diğer yükümlülüklerini ve tazminat sorumluluğunu ortadan kaldırmaz."
   },
   {
    "t": "h2",
    "x": "MADDE 13 — MÜCBİR SEBEP"
   },
   {
    "t": "p",
    "x": "13.1. Doğal afetler, salgın hastalıklar, savaş, terör, grev, lokavt, hükümet kararları ve yasaklamalar ile tarafların kontrolü dışında kalan ve öngörülemeyen diğer olaylar mücbir sebep olarak kabul edilir."
   },
   {
    "t": "p",
    "x": "13.2. Mücbir sebebin varlığı halinde, etkilenen tarafın sözleşmeden doğan yükümlülükleri mücbir sebep süresince askıya alınır ve bu durum sözleşme ihlali sayılmaz."
   },
   {
    "t": "p",
    "x": "13.3. Mücbir sebepten etkilenen taraf, durumu diğer tarafa 7 (yedi) gün içinde yazılı olarak bildirmek zorundadır."
   },
   {
    "t": "p",
    "x": "13.4. Mücbir sebebin 90 (doksan) günden fazla sürmesi halinde taraflardan her biri sözleşmeyi tazminatsız olarak feshedebilir."
   },
   {
    "t": "h2",
    "x": "MADDE 14 — BİLDİRİMLER VE TEBLİGAT"
   },
   {
    "t": "p",
    "x": "14.1. Taraflar, bu sözleşmede belirtilen adreslerini yasal tebligat adresleri olarak kabul ederler."
   },
   {
    "t": "p",
    "x": "14.2. Adres değişiklikleri, değişiklik tarihinden itibaren 15 (on beş) gün içinde diğer tarafa yazılı olarak bildirilecektir. Bildirim yapılmadıkça, mevcut adrese yapılan tebligatlar geçerli kabul edilecektir."
   },
   {
    "t": "p",
    "x": "14.3. Sözleşme kapsamındaki bildirimler noter ihtarnamesi, iadeli taahhütlü mektup veya KEP (Kayıtlı Elektronik Posta) aracılığıyla yapılabilir."
   },
   {
    "t": "h2",
    "x": "MADDE 15 — UYGULANACAK HUKUK VE UYUŞMAZLIK ÇÖZÜMÜ"
   },
   {
    "t": "p",
    "x": "15.1. Bu sözleşme Türk hukukuna tabidir ve Türk hukuku hükümlerine göre yorumlanır."
   },
   {
    "t": "p",
    "x": "15.2. Sözleşmeden doğan uyuşmazlıklarda öncelikle taraflar arasında iyi niyet çerçevesinde müzakere yoluna başvurulacaktır."
   },
   {
    "t": "p",
    "x": "15.3. Müzakere yoluyla çözüme ulaşılamaması halinde, uyuşmazlıkların çözümünde BALIKESİR Mahkemeleri ve İcra Daireleri münhasıran yetkilidir."
   },
   {
    "t": "p",
    "x": "15.4. SATICI’nın ticari defterleri, kayıtları ve muhasebe belgeleri, HMK’nın 193. maddesi uyarınca kesin delil niteliğindedir."
   },
   {
    "t": "h2",
    "x": "MADDE 16 — SON HÜKMÜLLER"
   },
   {
    "t": "p",
    "x": "16.1. Bu sözleşmenin herhangi bir maddesinin geçersiz sayılması, diğer maddelerin geçerliliğini etkilemez."
   },
   {
    "t": "p",
    "x": "16.2. Sözleşmede yapılacak her türlü değişiklik ve ek, ancak tarafların yazılı mutabakatı ile geçerli olacaktır."
   },
   {
    "t": "p",
    "x": "16.3. Taraflardan birinin sözleşmeden doğan bir hakkını kullanmaması veya gecikmeli kullanması, bu haktan feragat ettiği anlamına gelmez."
   },
   {
    "t": "p",
    "x": "16.4. Bu sözleşme tarafların serbest iradeleri ile akdedilmiş olup, herhangi bir baskı, tehdit veya zorlama altında imzalanmamıştır."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "İşbu sözleşme 16 (onaltı) maddeden ve 7(yedi) sayfadan oluşmakta olup, taraflarca okunup anlaşılarak […./…./………] tarihinde 2 (iki) nüsha olarak imzalanmıştır."
   },
   {
    "t": "imza",
    "sol": [
     "SATICI",
     "Rota SMI Tarım Hayvancılık",
     "Sanayi Ticaret A.Ş.",
     "Yetkili: İbrahim ÜRENLİOĞLU"
    ],
    "sag": [
     "HİZMET VEREN",
     "{adSoyad}"
    ]
   }
  ]
 },
 "kvkk": {
  "ad": "KVKK Aydınlatma Metni",
  "bloklar": [
   {
    "t": "ust",
    "x": "ROTA SMI TARIM VE HAYVANCILIK SAN. TİC. A.Ş."
   },
   {
    "t": "h1",
    "x": "TEKNİK DANIŞMAN / BAYİ / MÜŞTERİ KİŞİSEL VERİLERİN KORUNMASI KANUNU KAPSAMINDA AYDINLATMA METNİ"
   },
   {
    "t": "h2",
    "x": "1. VERİ SORUMLUSUNUN KİMLİĞİ"
   },
   {
    "t": "p",
    "x": "Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu’nun (“Kanun”) 10. maddesi ile Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ kapsamında, veri sorumlusu sıfatıyla aşağıda bilgileri yer alan şirket tarafından hazırlanmıştır."
   },
   {
    "t": "bos"
   },
   {
    "t": "kv",
    "k": "Unvan",
    "v": "Rota SMI Tarım ve Hayvancılık San. Tic. A.Ş."
   },
   {
    "t": "kv",
    "k": "Adres",
    "v": "Gümüşçeşme Mah. 8175. Sk. Ticaret Borsası Sitesi C Blok No:6/19B Altıeylül/BALIKESİR"
   },
   {
    "t": "kv",
    "k": "MERSİS No",
    "v": "0735207661900001"
   },
   {
    "t": "kv",
    "k": "Vergi Dairesi / VKN",
    "v": "735 207 6619"
   },
   {
    "t": "kv",
    "k": "Telefon",
    "v": "0266 249 07 77"
   },
   {
    "t": "kv",
    "k": "E-posta",
    "v": "muhasebe@rotasmi.com.tr"
   },
   {
    "t": "kv",
    "k": "KEP Adresi",
    "v": "rotasmitarim@hs03.kep.tr"
   },
   {
    "t": "kv",
    "k": "KVKK Başvuru E-postası",
    "v": "kvkk@rotasmi.com.tr"
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Bu metin; Rota SMI (“Şirket”) ile ticari ilişkisi bulunan teknik danışmanların, bayilerin ve müşterilerin kişisel verilerinin hangi amaçlarla işlendiğini, kimlere ve hangi amaçla aktarılabileceğini, veri toplamanın yöntemini ve hukuki sebebini, saklama sürelerini ve Kanun kapsamındaki haklarınızı açıklamaktadır."
   },
   {
    "t": "h3",
    "x": "2. İŞLENEN KİŞİSEL VERİLER, İŞLEME AMAÇLARI, HUKUKİ SEBEPLERİ VE SAKLAMA SÜRELERİ"
   },
   {
    "t": "p",
    "x": "Şirketimiz tarafından aşağıda kategorize edilen kişisel verileriniz, belirtilen amaçlarla ve hukuki sebeplere dayanılarak işlenmektedir."
   },
   {
    "t": "bos"
   },
   {
    "t": "tbl",
    "rows": [
     [
      "Kişisel Veri Kategorisi",
      "İşlenme Amacı",
      "Hukuki Sebebi (KVKK m.5/2)",
      "Saklama Süresi"
     ],
     [
      "A) ORTAK VERİLER (Teknik Danışman, Bayi ve Müşteriler İçin Geçerli)"
     ],
     [
      "Kimlik Bilgileri (Ad, Soyad, T.C. Kimlik No, Vergi Kimlik No, İmza)",
      "Sözleşme kurulması ve ifası, fatura düzenleme, yasal yükümlülüklerin yerine getirilmesi",
      "Kanunlarda açıkça öngörülmesi; Sözleşmenin kurulması veya ifası için gerekli olması",
      "Sözleşme süresi + 10 yıl (TTK m.82, VUK m.253)"
     ],
     [
      "İletişim Bilgileri (Telefon, GSM, E-posta, Adres, KEP Adresi)",
      "İletişim faaliyetlerinin yürütülmesi, sözleşmenin ifası, tebligat, fatura/irsaliye iletimi",
      "Sözleşmenin kurulması veya ifası; Meşru menfaat",
      "Sözleşme süresi + 10 yıl"
     ],
     [
      "Finansal Bilgiler (IBAN, Banka Bilgileri, Çek/Senet Bilgileri)",
      "Ödeme yapılması, iade işlemleri, teminat yönetimi",
      "Sözleşmenin kurulması veya ifası; Bir hakkın tesisi, kullanılması veya korunması",
      "Sözleşme süresi + 10 yıl (TTK m.82)"
     ],
     [
      "Fatura Bilgileri (Faturada yer alan tüm bilgiler, Vergi Dairesi, MERSİS No, Ticaret Sicil No)",
      "Fatura düzenleme, muhasebe işlemlerinin yürütülmesi, kanuni yükümlülükler",
      "Kanunlarda açıkça öngörülmesi (VUK, TTK)",
      "Düzenleme tarihi + 10 yıl (VUK m.253)"
     ],
     [
      "Sözleşme Bilgileri (Sözleşme içeriği, imza sirküleri, ticaret sicil gazetesi, vekâletname)",
      "Sözleşmenin hazırlanması, müşteri/bayi ilişkisinin ispatı, hukuki süreçlerin yürütülmesi",
      "Sözleşmenin kurulması veya ifası; Bir hakkın tesisi, kullanılması veya korunması",
      "Sözleşme süresi + 10 yıl (TBK m.146)"
     ],
     [
      "Talep ve Şikâyet Verileri (İletilen talepler, şikâyetler, geri bildirimler)",
      "Talep ve şikâyetlerin karşılanması, müşteri memnuniyetinin sağlanması",
      "Sözleşmenin ifası; Meşru menfaat",
      "Çözüm tarihi + 3 yıl"
     ],
     [
      "B) BAYİLERE ÖZEL VERİLER"
     ],
     [
      "Teminat Bilgileri (Banka teminat mektubu, çek, senet bilgileri)",
      "Bayilik sözleşmesi kapsamında teminat yönetimi ve alacak güvencesi",
      "Sözleşmenin kurulması veya ifası; Bir hakkın tesisi, kullanılması veya korunması",
      "Sözleşme süresi + teminat iadesi + 10 yıl"
     ],
     [
      "İşletme Bilgileri (Depo kapasitesi, soğuk zincir durumu, araç bilgileri, tabela ölçüleri)",
      "Bayilik uygunluk değerlendirmesi, lojistik planlama, dağıtım ağı yönetimi",
      "Sözleşmenin kurulması veya ifası; Meşru menfaat",
      "Sözleşme süresi + 5 yıl"
     ],
     [
      "Sipariş ve Mal Kabul Bilgileri (Sipariş detayları, teslim tutanakları, imzalar)",
      "Sipariş takibi, sevkiyat yönetimi, teslimat ispatı",
      "Sözleşmenin ifası; Kanunlarda açıkça öngörülmesi",
      "İşlem tarihi + 10 yıl"
     ],
     [
      "Satış Performans Verileri (Satış hacimleri, hedef gerçekleşme oranları)",
      "Bayilik sözleşmesi kapsamında performans takibi, asgari satış hedefi değerlendirmesi",
      "Sözleşmenin ifası; Meşru menfaat",
      "Sözleşme süresi + 3 yıl"
     ],
     [
      "Yetkili Kişi ve Çalışan Bilgileri (Bayi nezdinde çalışan kişilerin ad, soyad, T.C. kimlik no)",
      "Yetkili kişi tespiti, sözleşme ifası, iletişim",
      "Sözleşmenin ifası; Meşru menfaat",
      "Sözleşme süresi + 5 yıl"
     ],
     [
      "Randevu ve Ziyaret Bilgileri (Bayi ziyaretleri, toplantı kayıtları)",
      "İş ilişkisinin yürütülmesi, denetim faaliyetleri",
      "Meşru menfaat",
      "İlgili yıl + 3 yıl"
     ],
     [
      "C) TEKNİK DANIŞMANLARA ÖZEL VERİLER"
     ],
     [
      "Saha Ziyaret Verileri (Ziyaret edilen çiftlik/bayi bilgileri, ziyaret tarihleri, raporlar)",
      "Hizmet sözleşmesinin ifası, performans takibi, müşteri ilişkileri yönetimi",
      "Sözleşmenin ifası; Meşru menfaat",
      "Sözleşme süresi + 5 yıl"
     ],
     [
      "Performans ve Satış Verileri (Yönlendirilen müşteriler, satış katkısı, raporlar)",
      "Hizmet bedeli hesaplaması, performans değerlendirmesi",
      "Sözleşmenin ifası",
      "Sözleşme süresi + 5 yıl"
     ],
     [
      "Sosyal Medya Paylaşım Verileri (Rota markaları ile yapılan paylaşımlara ilişkin bilgiler)",
      "Marka kullanım kurallarına uyumun denetimi, sözleşme yükümlülüklerinin takibi",
      "Sözleşmenin ifası; Meşru menfaat (marka değerinin korunması)",
      "Sözleşme süresi + 2 yıl"
     ],
     [
      "Seyahat ve Konaklama Bilgileri (Onaylanan seyahatlere ait bilgiler)",
      "Masraf yönetimi, gider belgelendirmesi",
      "Sözleşmenin ifası",
      "İlgili mali yıl + 5 yıl"
     ],
     [
      "Hizmet Bedeli Ödeme Bilgileri (Serbest meslek makbuzu, fatura bilgileri, ödeme kayıtları)",
      "Hizmet bedeli ödemesi, muhasebe ve vergi yükümlülükleri",
      "Sözleşmenin ifası; Kanunlarda açıkça öngörülmesi",
      "Düzenleme tarihi + 10 yıl"
     ],
     [
      "D) MÜŞTERİLERE (ÇİFTLİK / BESİCİ / KOOPERATİF) ÖZEL VERİLER"
     ],
     [
      "Hayvan ve İşletme Bilgileri (Hayvan sayısı, tür bilgisi, işletme kapasitesi)",
      "Teknik danışmanlık hizmeti, ürün önerisi, rasyon hesaplaması",
      "Sözleşmenin ifası; Meşru menfaat",
      "Sözleşme süresi + 3 yıl"
     ],
     [
      "Sipariş ve Mal Kabul Bilgileri (Sipariş detayları, teslimat tutanakları)",
      "Sipariş takibi, sevkiyat, teslimat ispatı",
      "Sözleşmenin ifası; Kanunlarda açıkça öngörülmesi",
      "İşlem tarihi + 10 yıl"
     ],
     [
      "Referans ve Memnuniyet Verileri (Müşteri görüşleri, referans bilgileri)",
      "Hizmet kalitesinin artırılması, referans kullanımı (açık rıza ile)",
      "Açık rıza (referans kullanımı için); Meşru menfaat (hizmet kalitesi için)",
      "Rıza geri alınana kadar / İlgili yıl + 2 yıl"
     ]
    ],
    "bas": true
   },
   {
    "t": "h2",
    "x": "3. KİŞİSEL VERİ TOPLAMANIN YÖNTEMİ VE HUKUKİ SEBEBİ"
   },
   {
    "t": "p",
    "x": "Kişisel verileriniz aşağıdaki yöntemlerle toplanmaktadır:"
   },
   {
    "t": "li",
    "x": "• Fiziksel yollar: Sözleşmeler, başvuru formları, kartvizitler, faturalar, irsaliyeler, teslim tutanakları, ziyaret formları ve saha raporları,"
   },
   {
    "t": "li",
    "x": "• Elektronik yollar: E-posta, telefon görüşmeleri, web sitesi iletişim formları, WhatsApp ve benzeri mesajlaşma uygulamaları,"
   },
   {
    "t": "li",
    "x": "• Üçüncü kişilerden: Resmi kurumlar (Ticaret Sicil Müdürlüğü, Vergi Dairesi), mali müşavirler, referans veren iş ortakları."
   },
   {
    "t": "p",
    "x": "Bu veriler, Kanun’un 5. maddesinin 2. fıkrasında sayılan aşağıdaki hukuki sebeplere dayanılarak işlenmektedir:"
   },
   {
    "t": "li",
    "x": "a) Kanunlarda açıkça öngörülmesi (VUK, TTK, SGK mevzuatı, Ticaret Kanunu),"
   },
   {
    "t": "li",
    "x": "b) Bir sözleşmenin kurulması veya ifasıyla doğrudan doğruya ilgili olması,"
   },
   {
    "t": "li",
    "x": "c) Veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması,"
   },
   {
    "t": "li",
    "x": "d) İlgili kişinin kendisi tarafından alenileştirilmiş olması,"
   },
   {
    "t": "li",
    "x": "e) Bir hakkın tesisi, kullanılması veya korunması için veri işlemenin zorunlu olması,"
   },
   {
    "t": "li",
    "x": "f) İlgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla, veri sorumlusunun meşru menfaatleri için veri işlenmesinin zorunlu olması."
   },
   {
    "t": "p",
    "x": "Açık rıza gerektiren durumlarda (pazarlama amaçlı elektronik ileti gönderimi, referans olarak kullanım, fotoğraf/video kullanımı vb.) ayrıca açık rızanız talep edilecektir."
   },
   {
    "t": "h2",
    "x": "4. KİŞİSEL VERİLERİN AKTARILMASI"
   },
   {
    "t": "h3",
    "x": "4.1. Yurt İçi Aktarım:"
   },
   {
    "t": "p",
    "x": "Kişisel verileriniz, Kanun’un 8. maddesi kapsamında aşağıdaki taraflara aktarılabilmektedir:"
   },
   {
    "t": "bos"
   },
   {
    "t": "tbl",
    "rows": [
     [
      "Aktarılan Taraf",
      "Aktarım Amacı",
      "Hukuki Sebebi"
     ],
     [
      "Yetkili Kamu Kurum ve Kuruluşları (Vergi Dairesi, SGK, Mahkemeler, İcra Daireleri)",
      "Yasal yükümlülüklerin yerine getirilmesi, resmi bilgi/belge talepleri",
      "Kanunlarda açıkça öngörülmesi; Hukuki yükümlülük"
     ],
     [
      "Mali Müşavir / Yeminli Mali Müşavir",
      "Muhasebe, vergi beyannamesi, denetim hizmetleri",
      "Kanunlarda açıkça öngörülmesi; Sözleşmenin ifası"
     ],
     [
      "Avukat / Hukuk Danışmanı",
      "Hukuki süreçlerin yürütülmesi, dava ve savunma hakları",
      "Bir hakkın tesisi, kullanılması veya korunması"
     ],
     [
      "Bankalar ve Finans Kuruluşları",
      "Ödeme, havale, teminat işlemleri",
      "Sözleşmenin ifası"
     ],
     [
      "Lojistik ve Kargo Firmaları",
      "Ürün sevkiyatı ve teslimat",
      "Sözleşmenin ifası"
     ],
     [
      "Teknoloji Hizmet Sağlayıcıları (Yazılım, sunucu, e-posta hizmeti)",
      "Bilgi teknolojileri altyapısının işletilmesi, veri güvenliği",
      "Meşru menfaat; Sözleşmenin ifası"
     ],
     [
      "Bağımsız Denetim Kuruluşları (varsa)",
      "Yasal denetim yükümlülükleri",
      "Kanunlarda açıkça öngörülmesi"
     ]
    ],
    "bas": true
   },
   {
    "t": "bos"
   },
   {
    "t": "h3",
    "x": "4.2. Yurt Dışına Aktarım:"
   },
   {
    "t": "p",
    "x": "Şirketimiz, faaliyetleri kapsamında bulut bilişim hizmetleri, e-posta altyapısı, müşteri ilişkileri yönetim yazılımları (CRM) ve benzeri teknoloji hizmetlerinden yararlanabilmektedir. Bu hizmet sağlayıcılarının sunucuları yurt dışında bulunabilir."
   },
   {
    "t": "p",
    "x": "Yurt dışına veri aktarımı yapılması halinde, Kanun’un 9. maddesi kapsamında; yeterli korumanın bulunduğu ülkelere veya yeterli korumanın bulunmadığı ülkelerdeki veri sorumlularının yeterli bir korumayı yazılı olarak taahhüt etmeleri ve Kişisel Verileri Koruma Kurulu’nun izninin bulunması koşuluyla gerçekleştirilecektir."
   },
   {
    "t": "p",
    "x": "Aktarımın yapıldığı ülkeler ve hizmet sağlayıcıları hakkında güncel bilgi, Şirketimize başvuru yoluyla temin edilebilir."
   },
   {
    "t": "h2",
    "x": "5. TEKNİK DANIŞMANLARA ÖZEL BİLGİLENDİRME"
   },
   {
    "t": "p",
    "x": "Teknik danışmanlık ve satış-pazarlama hizmeti sözleşmesi kapsamında görev yapan teknik danışmanların dikkatine:"
   },
   {
    "t": "li",
    "x": "a) Saha ziyaretleri sırasında elde edilen müşteri bilgileri, Şirketimize ait kişisel veri niteliğindedir. Bu bilgilerin üçüncü kişilerle paylaşılması KVKK kapsamında veri ihlali teşkil edebilir."
   },
   {
    "t": "li",
    "x": "b) Sosyal medya hesaplarınızda Şirketimizin markaları ile yaptığınız paylaşımlar, sözleşme kapsamındaki marka kullanım kurallarına uyumun denetimi amacıyla izlenebilmektedir. Bu izleme, yalnızca kamuya açık paylaşımlarla sınırlıdır ve hizmet sözleşmesinin ifası ile Şirketimizin meşru menfaati (marka değerinin korunması) hukuki sebeplerine dayanmaktadır."
   },
   {
    "t": "li",
    "x": "c) Hizmet sözleşmesinin sona ermesi halinde, elinizdeki tüm müşteri bilgilerini, belgeleri ve elektronik verileri Şirkete iade etmeniz veya imha etmeniz gerekmektedir."
   },
   {
    "t": "h2",
    "x": "6. VERİ SAKLAMA SÜRELERİ HAKKINDA GENEL BİLGİ"
   },
   {
    "t": "p",
    "x": "Kişisel verileriniz, yukarıdaki tabloda belirtilen saklama süreleri boyunca işlenecek ve muhafaza edilecektir. Saklama süreleri belirlenirken aşağıdaki kriterler esas alınmıştır:"
   },
   {
    "t": "li",
    "x": "• Türk Ticaret Kanunu (TTK) m.82: Ticari defterler, belgeler ve faturalar için 10 yıl,"
   },
   {
    "t": "li",
    "x": "• Vergi Usul Kanunu (VUK) m.253: Vergi ile ilgili belgelerin 5 yıl muhafazası,"
   },
   {
    "t": "li",
    "x": "• Türk Borçlar Kanunu (TBK) m.146: Genel zamanaşımı süresi 10 yıl,"
   },
   {
    "t": "li",
    "x": "• 6698 sayılı KVKK m.7: İşleme amacı ortadan kalktığında silme/yok etme/anonimleştirme yükümlülüğü."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Saklama süresinin dolmasının ardından kişisel verileriniz, Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik uyarınca en geç 180 gün içinde silinecek, yok edilecek veya anonim hale getirilecektir."
   },
   {
    "t": "h2",
    "x": "7. KİŞİSEL VERİ SAHİBİ OLARAK HAKLARINIZ"
   },
   {
    "t": "p",
    "x": "Kanun’un 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:"
   },
   {
    "t": "li",
    "x": "a) Kişisel verilerinizin işlenip işlenmediğini öğrenme,"
   },
   {
    "t": "li",
    "x": "b) Kişisel verileriniz işlenmişse buna ilişkin bilgi talep etme,"
   },
   {
    "t": "li",
    "x": "c) Kişisel verilerinizin işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme,"
   },
   {
    "t": "li",
    "x": "d) Yurt içinde veya yurt dışında kişisel verilerinizin aktarıldığı üçüncü kişileri bilme,"
   },
   {
    "t": "li",
    "x": "e) Kişisel verilerinizin eksik veya yanlış işlenmiş olması halinde bunların düzeltilmesini isteme,"
   },
   {
    "t": "li",
    "x": "f) Kanun’un 7. maddesinde öngörülen şartlar çerçevesinde kişisel verilerinizin silinmesini veya yok edilmesini isteme,"
   },
   {
    "t": "li",
    "x": "g) Düzeltme, silme veya yok etme işlemlerinin kişisel verilerinizin aktarıldığı üçüncü kişilere bildirilmesini isteme,"
   },
   {
    "t": "li",
    "x": "h) İşlenen verilerinizin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,"
   },
   {
    "t": "li",
    "x": "i) Kişisel verilerinizin Kanun’a aykırı olarak işlenmesi sebebiyle zarara uğramanız halinde zararınızın giderilmesini talep etme."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Otomatik karar alma hakkında bilgilendirme: Şirketimiz, kişisel verilerinizi münhasıran otomatik sistemler vasıtasıyla analiz ederek aleyhinize bir sonuç doğuracak şekilde herhangi bir karar alma mekanizması kullanmamaktadır. Bu durumun değişmesi halinde tarafınıza ayrıca bilgilendirme yapılacaktır."
   },
   {
    "t": "bos"
   },
   {
    "t": "h2",
    "x": "8. BAŞVURU YÖNTEMİ"
   },
   {
    "t": "p",
    "x": "Yukarıda sayılan haklarınızı kullanmak için aşağıdaki yöntemlerden birini tercih edebilirsiniz:"
   },
   {
    "t": "bos"
   },
   {
    "t": "tbl",
    "rows": [
     [
      "Başvuru Yöntemi",
      "Başvuru Adresi",
      "Açıklama"
     ],
     [
      "Yazılı Başvuru (Şahsen veya Noter)",
      "Gümüşçeşme Mah. 8175. Sk. Ticaret Borsası Sitesi C Blok No:6/19B Altıeylül/BALIKESİR",
      "Zarfın üzerine \"KVKK Başvurusu\" yazılmalıdır."
     ],
     [
      "Kayıtlı Elektronik Posta (KEP)",
      "rotasmitarim@hs03.kep.tr",
      "KEP hesabınızdan gönderim yapılmalıdır."
     ],
     [
      "Güvenli Elektronik İmza ile E-posta",
      "kvkk@rotasmi.com.tr",
      "E-postanın konu kısmına \"KVKK Başvurusu\" yazılmalıdır."
     ],
     [
      "Sistemimize Kayıtlı E-posta ile",
      "kvkk@rotasmi.com.tr",
      "Şirketimizde kayıtlı e-posta adresinizden gönderim yapılmalıdır."
     ]
    ],
    "bas": true
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Başvurunuzda; adınız, soyadınız, T.C. kimlik numaranız (yabancı uyruklu iseniz pasaport numarası), tebligata esas yerleşim yeri veya iş adresi, varsa bildirime esas e-posta adresi, telefon numarası ve talep konusu yer almalıdır."
   },
   {
    "t": "p",
    "x": "Başvurular, talebin niteliğine göre en kısa sürede ve en geç 30 (otuz) gün içinde ücretsiz olarak sonuçlandırılacaktır. İşlemin ayrıca bir maliyet gerektirmesi halinde, Kişisel Verileri Koruma Kurulu tarafından belirlenen tarife uygulanacaktır."
   },
   {
    "t": "h2",
    "x": "9. AYDINLATMA METNİNDE DEĞİŞİKLİK"
   },
   {
    "t": "p",
    "x": "Şirketimiz, yasal düzenlemeler ve Kişisel Verileri Koruma Kurulu kararları doğrultusunda bu aydınlatma metninde değişiklik yapma hakkını saklı tutar. Güncel metin, Şirketimizin web sitesinde ve işyerinde erişime açık olarak bulundurulacaktır."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Son Güncelleme Tarihi: [15.05.2026]"
   },
   {
    "t": "bos"
   },
   {
    "t": "h2",
    "x": "AYDINLATMA BEYANI"
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "Yukarıda açıklanan tüm hususlarda tarafıma gerekli aydınlatma yapıldığını, Rota SMI Tarım ve Hayvancılık San. Tic. A.Ş. Teknik Danışman / Bayi / Müşteri Aydınlatma Metni’ni okuduğumu, anladığımı ve 6698 sayılı Kanun’un 11. maddesi kapsamındaki haklarım konusunda bilgilendirildiğimi beyan ederim."
   },
   {
    "t": "bos"
   },
   {
    "t": "p",
    "x": "ÖNEMLİ NOT: Bu beyan, kişisel verilerinizin işlenmesine ilişkin açık rıza niteliği taşımamaktadır. Açık rıza gerektiren durumlarda (pazarlama amaçlı iletişim, referans kullanımı, fotoğraf/video paylaşımı vb.) ayrıca “Açık Rıza Formu” imzalatılacaktır."
   },
   {
    "t": "bos"
   },
   {
    "t": "h3",
    "x": "Statüsü (işaretleyiniz):"
   },
   {
    "t": "p",
    "x": "□ Teknik Danışman \t \t \t □ Bayi \t \t \t □ Müşteri"
   },
   {
    "t": "bos"
   },
   {
    "t": "kv",
    "k": "Veri Sahibi Adı Soyadı",
    "v": "........................................"
   },
   {
    "t": "p",
    "x": "T.C. Kimlik No : ..............................."
   },
   {
    "t": "kv",
    "k": "Tarih",
    "v": "....../....../..............."
   },
   {
    "t": "p",
    "x": "İmza : ..............................."
   }
  ]
 }
};
