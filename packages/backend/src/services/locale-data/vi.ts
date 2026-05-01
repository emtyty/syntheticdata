/**
 * Vietnamese (vi) locale overrides.
 *
 * Faker's `vi` locale has minimal coverage. This module supplies native
 * Vietnamese arrays for music, vehicle, commerce, company, food, and color
 * categories. Used as the FIRST locale in a chain `[viOverrides, fakerVi, en]`.
 *
 * NOTE: Trademarked entries (real car manufacturers/models, brand names) stay
 * here and are NOT contributed upstream. Generic cultural vocab is contributable.
 */

import type { LocaleDefinition } from '@faker-js/faker';

export const viOverrides: LocaleDefinition = {
  metadata: {
    title: 'Vietnamese (overrides)',
    code: 'vi',
    language: 'vi',
    endonym: 'Tiếng Việt',
    dir: 'ltr',
    script: 'Latn',
  },

  music: {
    genre: [
      'Vpop', 'Bolero', 'Trữ tình', 'Nhạc dân ca', 'Rap Việt', 'Nhạc đỏ',
      'Nhạc vàng', 'Nhạc trẻ', 'Indie', 'Rock', 'Pop', 'Ballad', 'EDM',
      'House', 'R&B', 'Hip Hop', 'Acoustic', 'Jazz', 'Cải lương',
      'Hát chèo', 'Nhạc cụ dân tộc', 'Nhạc thiếu nhi',
    ],
    songName: [
      'Hà Nội mùa thu', 'Sài Gòn đẹp lắm', 'Quê hương', 'Mưa Sài Gòn',
      'Tình yêu màu nắng', 'Hạ trắng', 'Diễm xưa', 'Cát bụi', 'Phố cổ',
      'Hoa sữa', 'Một mình', 'Đường về', 'Biển nhớ', 'Em ơi Hà Nội phố',
    ],
  },

  vehicle: {
    manufacturer: [
      'Toyota', 'Honda', 'Hyundai', 'KIA', 'Mazda', 'Mitsubishi', 'Ford',
      'VinFast', 'Suzuki', 'Nissan', 'Isuzu', 'Yamaha', 'Piaggio',
      'SYM', 'Kawasaki',
    ],
    model: [
      'Vios', 'City', 'Accent', 'Seltos', 'CX-5', 'Xpander', 'Ranger',
      'VF8', 'Fadil', 'Lux A2.0', 'Wave Alpha', 'Air Blade', 'Lead',
      'Vision', 'Sirius', 'Exciter', 'Winner X',
    ],
    type: [
      'Sedan', 'SUV', 'Hatchback', 'MPV', 'Pickup', 'Xe máy số', 'Xe tay ga',
      'Xe côn tay', 'Xe điện', 'Xe tải', 'Xe khách',
    ],
    fuel: ['Xăng', 'Dầu diesel', 'Hybrid', 'Điện', 'CNG'],
  },

  commerce: {
    department: [
      'Thực phẩm', 'Đồ uống', 'Điện máy', 'Thời trang', 'Sách',
      'Mỹ phẩm', 'Đồ chơi', 'Văn phòng phẩm', 'Thể thao', 'Đồ gia dụng',
      'Đồ thú cưng', 'Làm vườn', 'Nội thất', 'Bếp',
    ],
    productName: {
      adjective: [
        'Cao cấp', 'Truyền thống', 'Hiện đại', 'Bền', 'Nhẹ',
        'Tiện lợi', 'Đa năng', 'Sang trọng', 'Thân thiện', 'Tinh tế',
        'Chất lượng', 'Bền vững',
      ],
      material: [
        'Gỗ', 'Tre', 'Mây', 'Lụa', 'Gốm sứ', 'Đồng', 'Inox', 'Nhựa',
        'Da', 'Vải bố', 'Pha lê', 'Sơn mài',
      ],
      product: [
        'Áo dài', 'Nón lá', 'Bát', 'Đũa', 'Tô', 'Ấm trà', 'Ly', 'Đèn lồng',
        'Tranh sơn dầu', 'Khăn lụa', 'Túi xách', 'Quạt giấy', 'Chiếu cói',
      ],
    },
  },

  company: {
    suffix: ['Công ty TNHH', 'Công ty Cổ phần', 'Tập đoàn', 'Doanh nghiệp tư nhân', 'Hợp tác xã'],
    name: {
      pattern: ['{{company.suffix}} {{person.lastName}}'],
    },
    catchPhrase: {
      adjective: ['Đột phá', 'Tiên phong', 'Đáng tin cậy', 'Hiệu quả', 'Linh hoạt', 'Tích hợp', 'Mở rộng được'],
      descriptor: ['Giải pháp', 'Nền tảng', 'Dịch vụ', 'Hệ thống', 'Hạ tầng', 'Mạng lưới'],
      noun: ['Kiến trúc', 'Giao diện', 'Phương pháp', 'Mô hình', 'Giao thức'],
    },
  },

  food: {
    dish: [
      'Phở', 'Bún chả', 'Bún bò Huế', 'Bún riêu', 'Bánh mì', 'Bánh xèo',
      'Bánh cuốn', 'Gỏi cuốn', 'Chả giò', 'Cơm tấm', 'Cơm chiên',
      'Hủ tiếu', 'Mì Quảng', 'Cao lầu', 'Bánh khọt', 'Bún đậu mắm tôm',
      'Bánh chưng', 'Bánh tét',
    ],
    ingredient: [
      'Nước mắm', 'Mắm tôm', 'Hành lá', 'Rau mùi', 'Ngò gai', 'Tía tô',
      'Sả', 'Riềng', 'Đậu phộng', 'Tương ớt', 'Chanh', 'Ớt',
    ],
  },

  color: {
    human: [
      'Đỏ', 'Xanh dương', 'Xanh lá', 'Vàng', 'Đen', 'Trắng', 'Tím', 'Hồng',
      'Cam', 'Nâu', 'Xám', 'Vàng kim', 'Bạc', 'Xanh navy', 'Be', 'Đỏ đô',
    ],
  },

  animal: {
    dog: ['Chó Phú Quốc', 'Chó cỏ', 'Husky', 'Poodle', 'Chihuahua', 'Pug', 'Golden'],
    cat: ['Mèo mướp', 'Mèo tam thể', 'Mèo Anh lông ngắn', 'Mèo Ba Tư', 'Mèo Xiêm'],
    bird: ['Chim sẻ', 'Chim chào mào', 'Chim sáo', 'Chim vàng anh', 'Cú', 'Quạ', 'Bồ câu'],
  },

  hacker: {
    abbreviation: ['API', 'CPU', 'GPU', 'SSD', 'TCP', 'UDP', 'JSON', 'HTTP', 'HTTPS', 'DNS'],
    noun: [
      'Giao thức', 'Giao diện', 'Băng thông', 'Tường lửa', 'Hệ thống',
      'Driver', 'Bộ xử lý', 'Vi mạch',
    ],
    verb: [
      'Phân tích', 'Nén', 'Đồng bộ', 'Sao lưu', 'Phân giải', 'Điều hướng',
      'Xây dựng', 'Tích hợp',
    ],
  },
};
