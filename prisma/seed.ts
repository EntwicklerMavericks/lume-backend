import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Iniciando Seed Lume Store ---');

  // 1. Criar Usuário Administrador padrão
  const adminEmail = 'admin@lumestore.com.br';
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: 'Administrador Lume',
      active: true,
      emailVerified: true,
      role: 'ADMIN',
    },
    create: {
      name: 'Administrador Lume',
      email: adminEmail,
      password: hashedPassword,
      active: true,
      emailVerified: true,
      role: 'ADMIN',
    },
  });
  console.log(`[Seed] Administrador pronto: ${admin.email}`);

  // 2. Criar Categorias
  const categoriesData = [
    {
      id: 'cat-1',
      name: 'Camisetas Oversized',
      slug: 'camisetas',
      description: 'Camisetas oversized e boxy com tecidos de alta gramatura.',
      image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
    },
    {
      id: 'cat-2',
      name: 'Calças Cargo',
      slug: 'calcas',
      description: 'Calças cargo, parachute e joggers com estética urbana.',
      image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600&q=80',
    },
    {
      id: 'cat-3',
      name: 'Hoodies & Jaquetas',
      slug: 'jaquetas',
      description: 'Hoodies pesados, windbreakers e jaquetas street.',
      image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80',
    },
    {
      id: 'cat-4',
      name: 'Shorts & Bermudas',
      slug: 'shorts',
      description: 'Bermudas cargo e shorts de ripstop para compor o visual.',
      image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=600&q=80',
    },
    {
      id: 'cat-5',
      name: 'Bags & Acessórios',
      slug: 'acessorios',
      description: 'Shoulder bags, bonés e correntes para finalizar o kit.',
      image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=600&q=80',
    },
  ];

  const categoryMap = new Map<string, string>();

  for (const cat of categoriesData) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
        image: cat.image,
      },
      create: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        image: cat.image,
      },
    });
    categoryMap.set(cat.slug, created.id);
    console.log(`[Seed] Categoria pronta: ${created.name} (${created.id})`);
  }

  // 3. Criar Produtos Editoriais
  const productsData = [
    {
      sku: 'BAR-CAM-001',
      name: 'Camiseta Pima Essential Black',
      slug: 'camiseta-pima-essential-black',
      description: 'Confeccionada em 100% Algodão Pima peruano com toque acetinado e caimento impecável. Estrutura de gola reforçada em ribana e costuras limpas para um visual sofisticado e atemporal.',
      price: 159.90,
      promotionalPrice: null,
      stock: 45,
      status: true,
      gender: 'Masculino',
      highlight: true,
      newLaunch: true,
      categorySlug: 'camisetas',
      composition: '100% Algodão Pima Peruano Extra Long Staple',
      fit: 'Regular Tailored',
      washCare: 'Lavagem suave à máquina (até 30°C). Não utilizar secadora. Passar a ferro em temperatura média.',
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { name: 'Preto Intenso', hex: '#0a0a0a' },
        { name: 'Branco Óptico', hex: '#ffffff' },
        { name: 'Cinza Chumbo', hex: '#374151' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-CAM-002',
      name: 'Camiseta Boxy Heavyweight Minimal',
      slug: 'camiseta-boxy-heavyweight-minimal',
      description: 'Modelagem boxy moderna inspirada na estética minimalista japonesa. Tecido encorpado de alta gramatura (240g/m²) que mantém a estrutura da peça durante todo o dia.',
      price: 189.90,
      promotionalPrice: 159.90,
      stock: 30,
      status: true,
      gender: 'Masculino',
      highlight: true,
      newLaunch: false,
      categorySlug: 'camisetas',
      composition: '100% Algodão Encorpado 240g/m²',
      fit: 'Boxy Oversized',
      washCare: 'Lavar do avesso com cores semelhantes. Secar em varal à sombra.',
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { name: 'Off-White', hex: '#f4f4f0' },
        { name: 'Preto Intenso', hex: '#0a0a0a' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-CAL-003',
      name: 'Calça Alfaiataria Smart Stretch',
      slug: 'calca-alfaiataria-smart-stretch',
      description: 'A união perfeita entre a elegância da alfaiataria italiana e o conforto do elastano stretch. Cós anatômico, bolsos faca embutidos e barra italiana limpa.',
      price: 299.90,
      promotionalPrice: null,
      stock: 25,
      status: true,
      gender: 'Masculino',
      highlight: true,
      newLaunch: true,
      categorySlug: 'calcas',
      composition: '70% Poliéster nobre, 27% Viscose, 3% Elastano',
      fit: 'Slim Tapered',
      washCare: 'Lavagem a seco recomendada ou ciclo muito delicado.',
      sizes: ['38', '40', '42', '44', '46'],
      colors: [
        { name: 'Preto Clássico', hex: '#0a0a0a' },
        { name: 'Azul Midnight', hex: '#111827' },
        { name: 'Cinza Grafite', hex: '#4b5563' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-JAQ-004',
      name: 'Jaqueta Bomber Couro Sintético Premium',
      slug: 'jaqueta-bomber-couro-sintetico-premium',
      description: 'Design contemporâneo em couro sintético ecológico de acabamento fosco suave. Forro interno térmico em cetim preto e zíperes metálicos escurecidos de alta durabilidade.',
      price: 459.90,
      promotionalPrice: 399.90,
      stock: 12,
      status: true,
      gender: 'Masculino',
      highlight: true,
      newLaunch: true,
      categorySlug: 'jaquetas',
      composition: '100% Poliuretano premium / Forro: 100% Poliéster Satin',
      fit: 'Modern Bomber Fit',
      washCare: 'Limpar apenas com pano levemente úmido. Não lavar em máquina.',
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { name: 'Preto Matte', hex: '#0d0d0d' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-SHO-005',
      name: 'Bermuda Tailored Linen Blend',
      slug: 'bermuda-tailored-linen-blend',
      description: 'Bermuda de corte refinado em mescla de linho com algodão natural. Transpiração leve para dias quentes sem perder a compostura e sofisticação.',
      price: 199.90,
      promotionalPrice: null,
      stock: 18,
      status: true,
      gender: 'Masculino',
      highlight: false,
      newLaunch: false,
      categorySlug: 'shorts',
      composition: '55% Linho Puro, 45% Algodão Egípcio',
      fit: 'Tailored Above Knee',
      washCare: 'Lavar à mão ou em ciclo delicado com água fria.',
      sizes: ['38', '40', '42', '44'],
      colors: [
        { name: 'Preto', hex: '#0a0a0a' },
        { name: 'Areia Natural', hex: '#d1c7b7' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-CAL-006',
      name: 'Calça Jogger Tech Sartorial',
      slug: 'calca-jogger-tech-sartorial',
      description: 'Conforto urbano com estética esportiva de alto luxo. Tecido técnico repelente a respingos com punhos ajustados e cordão interno com ponteiras metálicas.',
      price: 269.90,
      promotionalPrice: null,
      stock: 20,
      status: true,
      gender: 'Masculino',
      highlight: false,
      newLaunch: true,
      categorySlug: 'calcas',
      composition: '88% Poliamida Tecnológica, 12% Elastano',
      fit: 'Athletic Tapered',
      washCare: 'Lavagem suave. Secagem rápida natural.',
      sizes: ['P', 'M', 'G', 'GG'],
      colors: [
        { name: 'Preto Carbono', hex: '#141414' },
        { name: 'Cinza Concreto', hex: '#4b5563' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-CAM-007',
      name: 'Camisa Manga Longa Popeline Pure Cotton',
      slug: 'camisa-manga-longa-popeline-pure-cotton',
      description: 'Camisa social contemporânea de algodão popeline de toque sedoso. Colarinho estruturado, botões de madrepérola natural e corte limpo sem bolsos aparentes.',
      price: 279.90,
      promotionalPrice: null,
      stock: 15,
      status: true,
      gender: 'Masculino',
      highlight: true,
      newLaunch: false,
      categorySlug: 'camisetas',
      composition: '100% Algodão Popeline Fio 80',
      fit: 'Modern Slim Fit',
      washCare: 'Lavagem suave. Passar a ferro a vapor para acabamento impecável.',
      sizes: ['2', '3', '4', '5'],
      colors: [
        { name: 'Branco Impecável', hex: '#ffffff' },
        { name: 'Preto Ônix', hex: '#0a0a0a' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
    {
      sku: 'BAR-ACE-008',
      name: 'Cinto Couro Legítimo Fivela Minimal',
      slug: 'cinto-couro-legitimo-fivela-minimal',
      description: 'Produzido em couro bovino legítimo com acabamento acetinado preto. Fivela metálica retangular escovada em tom chumbo grafite.',
      price: 149.90,
      promotionalPrice: null,
      stock: 35,
      status: true,
      gender: 'Masculino',
      highlight: false,
      newLaunch: false,
      categorySlug: 'acessorios',
      composition: '100% Couro Bovino Selecionado / Fivela de ZAMAC',
      fit: 'Largura 3.5cm',
      washCare: 'Hidratar com produto específico para couro a cada 6 meses.',
      sizes: ['90', '95', '100', '105', '110'],
      colors: [
        { name: 'Preto Acetinado', hex: '#0a0a0a' },
      ],
      images: [
        { url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1000&q=85', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=1000&q=85', isMain: false, order: 1 },
      ],
    },
  ];

  for (const prod of productsData) {
    const categoryId = categoryMap.get(prod.categorySlug);
    if (!categoryId) continue;

    const upserted = await prisma.product.upsert({
      where: { sku: prod.sku },
      update: {
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price,
        promotionalPrice: prod.promotionalPrice,
        stock: prod.stock,
        status: prod.status,
        gender: prod.gender,
        highlight: prod.highlight,
        newLaunch: prod.newLaunch,
        composition: prod.composition,
        fit: prod.fit,
        washCare: prod.washCare,
        sizes: prod.sizes,
        colors: prod.colors,
        categoryId,
      },
      create: {
        name: prod.name,
        slug: prod.slug,
        sku: prod.sku,
        description: prod.description,
        price: prod.price,
        promotionalPrice: prod.promotionalPrice,
        stock: prod.stock,
        status: prod.status,
        gender: prod.gender,
        highlight: prod.highlight,
        newLaunch: prod.newLaunch,
        composition: prod.composition,
        fit: prod.fit,
        washCare: prod.washCare,
        sizes: prod.sizes,
        colors: prod.colors,
        categoryId,
      },
    });

    // Re-create images idempotently
    await prisma.productImage.deleteMany({
      where: { productId: upserted.id },
    });

    await prisma.productImage.createMany({
      data: prod.images.map((img) => ({
        productId: upserted.id,
        url: img.url,
        isMain: img.isMain,
        order: img.order,
      })),
    });

    console.log(`[Seed] Produto pronto: ${upserted.name} (${upserted.sku})`);
  }

  console.log('--- Seed Lume Store finalizado com sucesso! ---');
}

main()
  .catch((e) => {
    console.error('Erro durante execução do Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
