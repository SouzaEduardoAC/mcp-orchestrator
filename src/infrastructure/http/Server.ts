import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

export class AppServer {
  public app: express.Application;
  public httpServer: HttpServer;
  public io: SocketIOServer;

  constructor() {
    this.app = express();
    this.configureMiddleware();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*', // Allow all for prototype
        methods: ['GET', 'POST']
      }
    });
  }

  private configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  public listen(port: number, callback?: () => void) {
    this.httpServer.listen(port, callback);
  }

  public close(callback?: (err?: Error) => void) {
      this.io.close();
      this.httpServer.close(callback);
  }
}
