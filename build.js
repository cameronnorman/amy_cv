const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const puppeteer = require('puppeteer');

// Configure marked for better rendering
marked.setOptions({
    breaks: true,
    gfm: true
});

// Configuration constants
const MAX_HEADER_LINES = 6;
const CV_VARIANTS = [
    {
        markdownFile: 'CV_de.md',
        outputSubdir: '',
        htmlFile: 'index.html',
        pdfFile: 'CV_de.pdf',
        optional: false,
        label: 'German'
    },
    {
        markdownFile: 'CV.md',
        outputSubdir: 'en',
        htmlFile: 'index.html',
        pdfFile: 'CV.pdf',
        optional: false,
        label: 'English'
    }
];

function extractHeaderAndContent(cvMarkdown) {
    const lines = cvMarkdown.split('\n');
    let headerMarkdown = '';
    let contentMarkdown = '';
    let headerLineCount = 0;

    // Extract first few lines for header (name, title, contact info)
    for (let i = 0; i < lines.length && headerLineCount < MAX_HEADER_LINES; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#') || line.startsWith('**') || line.includes('@') || line.includes('[')) {
            headerMarkdown += lines[i] + '\n';
            headerLineCount++;
        } else if (headerLineCount > 0 && line.length === 0) {
            // Stop at first empty line after header content
            contentMarkdown = lines.slice(i).join('\n');
            break;
        }
    }
    
    // If we didn't find a natural break, use first MAX_HEADER_LINES as header
    if (!contentMarkdown) {
        headerMarkdown = lines.slice(0, MAX_HEADER_LINES).join('\n');
        contentMarkdown = lines.slice(MAX_HEADER_LINES).join('\n');
    }

    return { headerMarkdown, contentMarkdown };
}

function ensureDirectory(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }
}

function copyProfileImage(targetDirectory) {
    const assetsDir = path.join(__dirname, 'assets');
    const profileSrc = path.join(assetsDir, 'cv_image.jpeg');
    const profileDest = path.join(targetDirectory, 'cv_image.jpeg');

    if (!fs.existsSync(profileSrc)) {
        console.log('⚠️  Profile image not found, skipping image copy...');
        return;
    }

    fs.copyFileSync(profileSrc, profileDest);
    console.log(`✅ Copied profile image to ${targetDirectory}`);
}

async function generatePdf(browser, indexPath, pdfPath) {
    const page = await browser.newPage();
    await page.goto(`file://${indexPath}`, {
        waitUntil: 'networkidle0'
    });

    await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: false,
        margin: {
            top: '15mm',
            right: '15mm',
            bottom: '15mm',
            left: '15mm'
        }
    });

    await page.close();
}

async function buildVariant(template, distDir, browser, variant) {
    const cvPath = path.join(__dirname, variant.markdownFile);
    if (!fs.existsSync(cvPath)) {
        if (variant.optional) {
            console.log(`ℹ️  ${variant.markdownFile} not found, skipping ${variant.label} build`);
            return;
        }

        console.error(`❌ Error: ${variant.markdownFile} not found!`);
        process.exit(1);
    }

    const variantDir = path.join(distDir, variant.outputSubdir);
    ensureDirectory(variantDir);
    copyProfileImage(variantDir);

    const cvMarkdown = fs.readFileSync(cvPath, 'utf-8');
    console.log(`✅ Read ${variant.markdownFile}`);

    const { headerMarkdown, contentMarkdown } = extractHeaderAndContent(cvMarkdown);

    // Convert markdown to HTML
    const headerHtml = marked(headerMarkdown);
    const cvHtml = marked(contentMarkdown);
    console.log(`✅ Converted ${variant.markdownFile} to HTML`);

    // Inject CV content into template
    let finalHtml = template.replace('{{CONTENT}}', cvHtml);
    finalHtml = finalHtml.replace('{{HEADER_CONTENT}}', headerHtml);

    const indexPath = path.join(variantDir, variant.htmlFile);
    fs.writeFileSync(indexPath, finalHtml);
    console.log(`✅ Generated ${variant.outputSubdir ? `${variant.outputSubdir}/` : ''}${variant.htmlFile}`);

    if (!browser) {
        console.log(`⚠️  Skipping ${variant.pdfFile} generation (browser unavailable)`);
        return;
    }

    try {
        const pdfPath = path.join(variantDir, variant.pdfFile);
        await generatePdf(browser, indexPath, pdfPath);
        console.log(`✅ Generated ${variant.outputSubdir ? `${variant.outputSubdir}/` : ''}${variant.pdfFile}`);
    } catch (error) {
        console.error(`❌ Error generating ${variant.pdfFile}:`, error.message);
    }
}

async function buildCV() {
    console.log('🚀 Starting CV build process...');

    const distDir = path.join(__dirname, 'dist');
    ensureDirectory(distDir);

    const templatePath = path.join(__dirname, 'template.html');
    const template = fs.readFileSync(templatePath, 'utf-8');
    console.log('✅ Read HTML template');

    let browser = null;
    try {
        const puppeteerArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/google-chrome',
            args: puppeteerArgs
        });
        console.log('✅ Browser launched for PDF generation');
    } catch (error) {
        console.error('❌ Error launching browser for PDF generation:', error.message);
        console.log('⚠️  Continuing with HTML generation only...');
    }

    for (const variant of CV_VARIANTS) {
        await buildVariant(template, distDir, browser, variant);
    }

    if (browser) {
        await browser.close();
    }

    console.log('🎉 Build complete!');
    console.log(`📁 Output directory: ${distDir}`);
    console.log('   - index.html (German web version)');
    console.log('   - CV_de.pdf (German printable version)');
    console.log('   - en/index.html (English web version)');
    console.log('   - en/CV.pdf (English printable version)');
}

// Run the build
buildCV().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
});
