# Knowledge Canvas

Knowledge Canvas is a Windows desktop application for visually managing and linking your knowledge assets. Built with Next.js and Electron, it provides an intuitive canvas interface where you can upload files, create notes, and establish relationships between them.

## Features

- **File Upload & Node Creation**: Upload files (PDF, DOCX, TXT, XLSX, PPTX) and display them as interactive nodes on the canvas
- **Manual Note Creation**: Create text-based notes directly on the canvas
- **Visual Node Linking**: Link nodes together visually to establish relationships between knowledge assets
- **Dynamic Contextual Search**: Search the canvas for nodes containing specific text, with adjustable depth for displaying linked nodes
- **Shared Canvas View**: Enable shared read-only access to the canvas for team collaboration
- **Auto Layout**: Automatically arrange nodes for better organization
- **Tag System**: Organize nodes with a searchable tag system

## Technology Stack

- **Frontend**: Next.js 15 with React 18
- **Desktop**: Electron 31
- **UI Components**: Radix UI with Tailwind CSS
- **Database**: SQLite with Knex.js
- **AI Integration**: Google Genkit
- **State Management**: TanStack Query
- **Build Tools**: TypeScript, electron-builder

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd studio
```

2. Install dependencies:
```bash
npm install
```

3. Start the development environment:
```bash
npm run dev
```

This will start both the Next.js development server and the Electron app.

### Available Scripts

- `npm run dev` - Start development environment (Next.js + Electron)
- `npm run dev:next` - Start only Next.js development server
- `npm run dev:electron` - Start only Electron app
- `npm run build` - Build the complete application
- `npm run build:next` - Build Next.js application
- `npm run build:electron` - Build Electron application for Windows
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run genkit:dev` - Start Genkit development server
- `npm run genkit:watch` - Start Genkit with file watching

## Project Structure

```
src/
├── ai/                     # AI integration (Genkit)
├── app/                    # Next.js app directory
├── components/
│   ├── icons/             # Custom icon components
│   ├── knowledge-canvas/  # Main canvas components
│   └── ui/               # Reusable UI components
├── hooks/                 # Custom React hooks
├── lib/                   # Utility functions
└── types/                 # TypeScript type definitions

electron/                  # Electron main process files
├── database.js           # SQLite database setup
├── main.js              # Electron main process
└── preload.js           # Electron preload script
```

## Design Guidelines

- **Primary Color**: Indigo (#4B0082) - conveying intelligence, focus, and depth
- **Background**: Very light gray (#F0F0F0) - clean and unobtrusive backdrop
- **Accent Color**: Violet (#8A2BE2) - highlighting interactive elements
- **Typography**: Clean and modern fonts suitable for various sizes
- **Icons**: Simple, intuitive icons for file types and actions
- **Canvas**: Flexible and zoomable interface for free node arrangement

## Building for Production

To build the Windows application:

```bash
npm run build
```

This will create a distributable Windows executable in the `release/` directory.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checking
5. Submit a pull request

## License

This project is private and proprietary.

---

*Knowledge Canvas - Visually manage and link your knowledge assets.*
