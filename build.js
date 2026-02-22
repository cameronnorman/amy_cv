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

async function buildCV() {
    console.log('🚀 Starting CV build process...');

    // Create dist directory if it doesn't exist
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
        console.log('✅ Created dist directory');
    }

    // Copy profile image to dist
    const assetsDir = path.join(__dirname, 'assets');
    const profileSrc = path.join(assetsDir, 'cv_image.jpeg');
    const profileDest = path.join(distDir, 'cv_image.jpeg');
    
    if (fs.existsSync(profileSrc)) {
        fs.copyFileSync(profileSrc, profileDest);
        console.log('✅ Copied profile image');
    } else {
        console.log('⚠️  Profile image not found, skipping...');
    }

    // Read CV.md
    const cvPath = path.join(__dirname, 'CV.md');
    if (!fs.existsSync(cvPath)) {
        console.error('❌ Error: CV.md not found!');
        process.exit(1);
    }

    const cvMarkdown = fs.readFileSync(cvPath, 'utf-8');
    console.log('✅ Read CV.md');

    // Split content to extract header (name and title)
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

    // Convert markdown to HTML
    const headerHtml = marked(headerMarkdown);
    const cvHtml = marked(contentMarkdown);
    console.log('✅ Converted markdown to HTML');

    // Read template
    const templatePath = path.join(__dirname, 'template.html');
    const template = fs.readFileSync(templatePath, 'utf-8');
    console.log('✅ Read HTML template');

    // Inject CV content into template
    let finalHtml = template.replace('{{CONTENT}}', cvHtml);
    // Inject header content
    finalHtml = finalHtml.replace('{{HEADER_CONTENT}}', headerHtml);

    // Write index.html
    const indexPath = path.join(distDir, 'index.html');
    fs.writeFileSync(indexPath, finalHtml);
    console.log('✅ Generated index.html');

    // Generate PDF
    console.log('📄 Generating PDF...');
    try {
        const puppeteerArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
        
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: '/usr/bin/google-chrome',
            args: puppeteerArgs
        });
        const page = await browser.newPage();
        
        // Load the HTML file
        await page.goto(`file://${indexPath}`, {
            waitUntil: 'networkidle0'
        });

        // Generate PDF with optimized settings for better visual appeal
        const pdfPath = path.join(distDir, 'CV.pdf');
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

        await browser.close();
        console.log('✅ Generated CV.pdf');
    } catch (error) {
        console.error('❌ Error generating PDF:', error.message);
        console.log('⚠️  Continuing without PDF generation...');
    }

    console.log('🎉 Build complete!');
    console.log(`📁 Output directory: ${distDir}`);
    console.log('   - index.html (web version)');
    console.log('   - CV.pdf (printable version)');
}

// Run the build
buildCV().catch(error => {
    console.error('❌ Build failed:', error);
    process.exit(1);
});
