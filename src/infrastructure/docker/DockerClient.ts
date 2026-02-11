import Docker from 'dockerode';

export class DockerClient {
  private docker: Docker;

  constructor() {
    this.docker = new Docker();
  }

  /**
   * Spawns a new Docker container with the specified image and environment variables.
   * The container is configured with Tty: false, OpenStdin: true, and attached streams.
   *
   * @param image The Docker image to use.
   * @param env Key-value pairs of environment variables.
   * @param cmd Optional command to run in the container.
   * @param memory Optional memory limit in MB (default: 512MB).
   * @param cpu Optional CPU limit (default: 0.5 cores).
   * @returns The started Docker container instance.
   */
  async spawnContainer(
    image: string,
    env: Record<string, string>,
    cmd?: string[],
    memory?: number,
    cpu?: number
  ): Promise<Docker.Container> {
    const envArray = Object.entries(env).map(([key, value]) => `${key}=${value}`);

    const container = await this.docker.createContainer({
      Image: image,
      Env: envArray,
      Cmd: cmd,
      Tty: false,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
          Memory: (memory || 512) * 1024 * 1024, // Default 512MB
          NanoCpus: ((cpu || 0.5) * 1000000000), // Default 0.5 CPU
          NetworkMode: 'none'                     // Disable networking
      }
    });

    await container.start();
    return container;
  }
  
  /**
   * Helper to pull an image. specific for setup/testing.
   */
  async pullImage(image: string): Promise<void> {
      // Stream handling for pull is complex in dockerode, doing a basic follow
      await new Promise<void>((resolve, reject) => {
          this.docker.pull(image, (err: any, stream: any) => {
              if (err) return reject(err);
              this.docker.modem.followProgress(stream, onFinished, onProgress);

              function onFinished(err: any, output: any) {
                  if (err) return reject(err);
                  resolve();
              }
              function onProgress(event: any) {
                  // silent
              }
          });
      });
  }

  /**
   * Stops and removes a container by ID.
   * @param containerId The ID of the container to stop.
   */
  async stopContainer(containerId: string): Promise<void> {
      const container = this.docker.getContainer(containerId);
      try {
          await container.stop();
      } catch (e: any) {
          // Ignore if already stopped (304) or not found (404)
          if (e.statusCode !== 304 && e.statusCode !== 404) throw e;
      }
      try {
          await container.remove();
      } catch (e: any) {
           if (e.statusCode !== 404) throw e;
      }
  }

  getContainer(containerId: string): Docker.Container {
      return this.docker.getContainer(containerId);
  }
}
