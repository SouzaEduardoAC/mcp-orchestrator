"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const DockerContainerTransport_1 = require("../../../src/infrastructure/transport/DockerContainerTransport");
const stream_1 = require("stream");
// Mock Docker Container
const mockAttach = jest.fn();
const mockDemuxStream = jest.fn();
const mockContainer = {
    attach: mockAttach,
    modem: {
        demuxStream: mockDemuxStream
    }
};
describe('DockerContainerTransport', () => {
    let transport;
    let transportStream;
    beforeEach(() => {
        jest.clearAllMocks();
        transportStream = new stream_1.PassThrough();
        mockAttach.mockResolvedValue(transportStream);
        transport = new DockerContainerTransport_1.DockerContainerTransport(mockContainer);
    });
    it('should handle split JSON chunks', async () => {
        let capturedStdout;
        mockDemuxStream.mockImplementation((stream, stdout, stderr) => {
            capturedStdout = stdout;
        });
        await transport.start();
        if (!capturedStdout) {
            throw new Error("demuxStream was not called");
        }
        const onMessage = jest.fn();
        transport.onmessage = onMessage;
        // Simulate split chunk
        const msg1 = { jsonrpc: "2.0", method: "test", id: 1 };
        const serialized = JSON.stringify(msg1) + "\n";
        const part1 = serialized.substring(0, 10);
        const part2 = serialized.substring(10);
        capturedStdout.write(Buffer.from(part1));
        capturedStdout.write(Buffer.from(part2));
        // Allow event loop to tick
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(onMessage).toHaveBeenCalledTimes(1);
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ method: "test" }));
    });
});
