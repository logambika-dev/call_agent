// import { PrismaClient } from "@prisma/client";
import pkg from '@prisma/client';
const { PrismaClient } = pkg;



const globalForPrisma = global;

const prisma = globalForPrisma.prisma || new PrismaClient({
    log: [
        { level: 'query', emit: 'event' },
        { level: 'warn', emit: 'stdout' },
        { level: 'error', emit: 'stdout' }
    ],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});

// Log slow queries to help identify connection leaks
prisma.$on('query', (e) => {
    if (e.duration > 1000) { // Log queries taking more than 1 second
        console.log(`### Slow Query (${e.duration}ms):`, e.query.substring(0, 100));
    }
});

console.log("### Prisma Client Initialized");
console.log("### DB URL Configured:", process.env.DATABASE_URL ? "YES" : "NO");
if (process.env.DATABASE_URL) {
    const isLocal = process.env.DATABASE_URL.includes("localhost");
    console.log(`### Database Target: ${isLocal ? 'Localhost' : 'Remote'}`);
    // Debug: Show URL structure (mask password)
    const maskedUrl = process.env.DATABASE_URL.replace(/:([^@]+)@/, ':****@');
    console.log(`### DATABASE_URL: ${maskedUrl}`);
    console.log(`### Connection Limit Param: ${process.env.DATABASE_URL.match(/connection_limit=(\d+)/)?.[1] || 'Not Set (Default 5)'}`);
} else {
    console.error("### CRITICAL: DATABASE_URL is not set during Prisma initialization!");
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma;
